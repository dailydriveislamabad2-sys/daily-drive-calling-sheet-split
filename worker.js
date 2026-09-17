export default {
  async fetch(request, env) {
    try {
    const url = new URL(request.url);
    const cookie = request.headers.get('Cookie') || '';
    const getCookie = (name) => { const m = cookie.match(new RegExp('(?:^|; )'+name.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')+'=([^;]+)')); return m ? decodeURIComponent(m[1]) : ''; };
    const json = (data,status=200,headers={}) => Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
    async function hash(p) { const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p)); return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''); }
    let ensurePromise = null;
    async function ensure() {
      if (ensurePromise) return ensurePromise;
      ensurePromise = (async () => {

      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS riders (id TEXT PRIMARY KEY,name TEXT DEFAULT '',number TEXT DEFAULT '',plate TEXT DEFAULT '',last TEXT DEFAULT '',status TEXT DEFAULT 'Pending',next TEXT DEFAULT '',comment TEXT DEFAULT '',created_at INTEGER DEFAULT 0)`).run();
      try { await env.DB.prepare(`ALTER TABLE riders ADD COLUMN sheet_id TEXT DEFAULT 'default'`).run(); } catch(e) {}
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sheets (id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at INTEGER DEFAULT 0)`).run();
      await env.DB.prepare(`INSERT OR IGNORE INTO sheets (id,name,created_at) VALUES ('default','Calling Sheet',?)`).bind(Date.now()).run();
      await env.DB.prepare(`INSERT OR IGNORE INTO sheets (id,name,created_at) VALUES ('unassigned','Unassigned',?)`).bind(Date.now()).run();
      await env.DB.prepare(`UPDATE riders SET sheet_id='default' WHERE sheet_id IS NULL OR sheet_id=''`).run();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY,password_hash TEXT NOT NULL,role TEXT NOT NULL,created_at INTEGER DEFAULT 0)`).run();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,username TEXT NOT NULL,role TEXT NOT NULL,expires_at INTEGER NOT NULL)`).run();
      for (const col of [
        ['assigned_to',"TEXT DEFAULT ''"],['tags',"TEXT DEFAULT ''"],['status_updated_at','INTEGER DEFAULT 0'],['comment_updated_at','INTEGER DEFAULT 0'],['next_updated_at','INTEGER DEFAULT 0'],['updated_at','INTEGER DEFAULT 0'],['updated_by',"TEXT DEFAULT ''"]
      ]) { try { await env.DB.prepare(`ALTER TABLE riders ADD COLUMN ${col[0]} ${col[1]}`).run(); } catch(e) {} }
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS call_history (id TEXT PRIMARY KEY,rider_id TEXT NOT NULL,username TEXT DEFAULT '',sheet_id TEXT DEFAULT 'default',action TEXT NOT NULL,old_value TEXT DEFAULT '',new_value TEXT DEFAULT '',created_at INTEGER DEFAULT 0)`).run();
      for (const col of [['username',"TEXT DEFAULT ''"],['sheet_id',"TEXT DEFAULT 'default'"],['action',"TEXT DEFAULT ''"],['old_value',"TEXT DEFAULT ''"],['new_value',"TEXT DEFAULT ''"],['created_at','INTEGER DEFAULT 0']]) { try { await env.DB.prepare(`ALTER TABLE call_history ADD COLUMN ${col[0]} ${col[1]}`).run(); } catch(e) {} }
      const adminUser=env.ADMIN_USERNAME||'admin', adminPass=env.ADMIN_PASSWORD||'DailyDrive@2026';
      const userName=env.USER_USERNAME||'user', userPass=env.USER_PASSWORD||'DailyDriveUser@2026';
      const ah=await hash(adminPass), uh=await hash(userPass);
      await env.DB.prepare('INSERT OR IGNORE INTO users (username,password_hash,role,created_at) VALUES (?,?,?,?)').bind(adminUser,ah,'admin',Date.now()).run();
      await env.DB.prepare('INSERT OR IGNORE INTO users (username,password_hash,role,created_at) VALUES (?,?,?,?)').bind(userName,uh,'user',Date.now()).run();
      })();
      try { return await ensurePromise; }
      catch (e) { ensurePromise = null; throw e; }
    }
    const SESSION_TTL_MS=1000*60*60*24*30; // 30 days; refresh does not log the user out
    const COOKIE_SECURE=url.protocol==='https:'?'; Secure':''; // also works on local HTTP preview
    async function auth(required=true) {
      const token=getCookie('dd_session'); if(!token) return required?null:null;
      const s=await env.DB.prepare('SELECT username,role,expires_at FROM sessions WHERE token=?').bind(token).first();
      if(!s) return null;
      if(Number(s.expires_at)<Date.now()) { try{await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(token).run();}catch(e){} return null; }
      return {username:s.username,role:s.role};
    }
    await ensure();
      if(url.pathname==='/api/login' && request.method==='POST') {
        const b=await request.json(); const u=String(b.username||'').trim(); const p=String(b.password||'');
        const row=await env.DB.prepare('SELECT username,password_hash,role FROM users WHERE username=?').bind(u).first();
        if(!row || await hash(p)!==row.password_hash) return json({error:'Invalid username or password'},401);
        const token=crypto.randomUUID()+crypto.randomUUID(); const exp=Date.now()+SESSION_TTL_MS;
        await env.DB.prepare('INSERT INTO sessions (token,username,role,expires_at) VALUES (?,?,?,?)').bind(token,row.username,row.role,exp).run();
        return json({ok:true,user:{username:row.username,role:row.role}},200,{'Set-Cookie':`dd_session=${encodeURIComponent(token)}; Path=/; HttpOnly${COOKIE_SECURE}; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS/1000)}`});
      }
      if(url.pathname==='/api/logout' && request.method==='POST') { const t=getCookie('dd_session'); if(t) await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(t).run(); return json({ok:true},200,{'Set-Cookie':`dd_session=; Path=/; HttpOnly${COOKIE_SECURE}; SameSite=Lax; Max-Age=0`}); }
      if(url.pathname==='/api/me' && request.method==='GET') { const me=await auth(); if(!me) return json({error:'Not authenticated'},401); return json({user:me}); }
      if(url.pathname==='/api/users' && request.method==='GET') {
        const me=await auth(); if(!me || me.role!=='admin') return json({error:'Admin access required'},403);
        const {results}=await env.DB.prepare('SELECT username,role,created_at FROM users ORDER BY username COLLATE NOCASE ASC').all();
        return json(results);
      }
      if(url.pathname.startsWith('/api/users/') && request.method==='GET') {
        const me=await auth(); if(!me || me.role!=='admin') return json({error:'Admin access required'},403);
        const username=decodeURIComponent(url.pathname.split('/').pop());
        const row=await env.DB.prepare('SELECT username,role,created_at FROM users WHERE username=?').bind(username).first();
        if(!row) return json({error:'User not found'},404);
        return json(row);
      }
      if(url.pathname==='/api/users' && request.method==='POST') {
        const me=await auth(); if(!me || me.role!=='admin') return json({error:'Admin access required'},403);
        const b=await request.json(); const username=String(b.username||'').trim(); const password=String(b.password||''); const role=['admin','user'].includes(String(b.role))?String(b.role):'user';
        if(!/^[A-Za-z0-9._-]{2,40}$/.test(username)) return json({error:'Invalid username'},400);
        if(password.length<6) return json({error:'Password must be at least 6 characters'},400);
        const exists=await env.DB.prepare('SELECT username FROM users WHERE username=?').bind(username).first(); if(exists) return json({error:'Username already exists'},409);
        await env.DB.prepare('INSERT INTO users (username,password_hash,role,created_at) VALUES (?,?,?,?)').bind(username,await hash(password),role,Date.now()).run();
        return json({ok:true,username,role},201);
      }
      if(url.pathname.startsWith('/api/users/') && request.method==='PUT') {
        const me=await auth(); if(!me || me.role!=='admin') return json({error:'Admin access required'},403);
        const username=decodeURIComponent(url.pathname.split('/').pop()); const row=await env.DB.prepare('SELECT username,role FROM users WHERE username=?').bind(username).first();
        if(!row) return json({error:'User not found'},404);
        const b=await request.json();
        const newUsername=String(b.username??username).trim();
        const role=['admin','user'].includes(String(b.role))?String(b.role):String(row.role);
        const password=String(b.password||'');
        if(!/^[A-Za-z0-9._-]{2,40}$/.test(newUsername)) return json({error:'Invalid username'},400);
        if(password && password.length<6) return json({error:'Password must be at least 6 characters'},400);
        if(newUsername!==username){
          const exists=await env.DB.prepare('SELECT username FROM users WHERE username=?').bind(newUsername).first();
          if(exists) return json({error:'Username already exists'},409);
        }
        if(password) await env.DB.prepare('UPDATE users SET username=?,role=?,password_hash=? WHERE username=?').bind(newUsername,role,await hash(password),username).run();
        else await env.DB.prepare('UPDATE users SET username=?,role=? WHERE username=?').bind(newUsername,role,username).run();
        await env.DB.prepare('UPDATE sessions SET username=?,role=? WHERE username=?').bind(newUsername,role,username).run();
        return json({ok:true,username:newUsername,role});
      }
      if(url.pathname.startsWith('/api/users/') && request.method==='DELETE') {
        const me=await auth(); if(!me || me.role!=='admin') return json({error:'Admin access required'},403);
        const username=decodeURIComponent(url.pathname.split('/').pop());
        if(username===me.username) return json({error:'You cannot delete your own account'},400);
        const row=await env.DB.prepare('SELECT username FROM users WHERE username=?').bind(username).first(); if(!row) return json({error:'User not found'},404);
        await env.DB.prepare('DELETE FROM sessions WHERE username=?').bind(username).run();
        await env.DB.prepare('DELETE FROM users WHERE username=?').bind(username).run();
        return json({ok:true});
      }

      if(url.pathname==='/api/hadith' && request.method==='GET') {
        const hadiths = [
          {text:'اعمال کا دارومدار نیتوں پر ہے اور ہر شخص کو وہی ملے گا جس کی اس نے نیت کی۔',hadithnumber:1,book:'صحیح البخاری'},
          {text:'مسلمان وہ ہے جس کی زبان اور ہاتھ سے دوسرے مسلمان محفوظ رہیں۔',hadithnumber:10,book:'صحیح البخاری'},
          {text:'تم میں سے کوئی شخص اس وقت تک مومن نہیں ہو سکتا جب تک اپنے بھائی کے لیے وہی پسند نہ کرے جو اپنے لیے پسند کرتا ہے۔',hadithnumber:13,book:'صحیح البخاری'},
          {text:'آسانی پیدا کرو، سختی نہ کرو، خوشخبری دو اور نفرت نہ دلاؤ۔',hadithnumber:69,book:'صحیح البخاری'},
          {text:'تم میں سب سے بہتر وہ ہے جو قرآن سیکھے اور اسے سکھائے۔',hadithnumber:5027,book:'صحیح البخاری'},
          {text:'جو شخص اللہ اور آخرت کے دن پر ایمان رکھتا ہے اسے چاہیے کہ اچھی بات کہے یا خاموش رہے۔',hadithnumber:6018,book:'صحیح البخاری'},
          {text:'طاقتور وہ نہیں جو کشتی میں دوسرے کو پچھاڑ دے، بلکہ طاقتور وہ ہے جو غصے کے وقت اپنے آپ پر قابو رکھے۔',hadithnumber:6114,book:'صحیح البخاری'},
          {text:'اللہ اس شخص پر رحم کرے جو خریدتے، بیچتے اور اپنا حق طلب کرتے وقت نرمی اختیار کرے۔',hadithnumber:2076,book:'صحیح البخاری'},
          {text:'تم میں سے ہر شخص نگہبان ہے اور ہر شخص سے اس کی رعیت کے بارے میں پوچھا جائے گا۔',hadithnumber:893,book:'صحیح البخاری'},
          {text:'پاکیزگی نصف ایمان ہے۔',hadithnumber:223,book:'صحیح مسلم'},
          {text:'صدقہ مال کو کم نہیں کرتا۔',hadithnumber:2588,book:'صحیح مسلم'},
          {text:'جو کسی مسلمان کی دنیاوی تکلیف دور کرے، اللہ قیامت کے دن اس کی تکلیف دور فرمائے گا۔',hadithnumber:2699,book:'صحیح مسلم'}
        ];
        return json({hadiths},200,{'Cache-Control':'no-store'});
      }
      if(url.pathname.startsWith('/api/')) {
        const me=await auth(); if(!me) return json({error:'Not authenticated'},401);
        if(url.pathname==='/api/bootstrap' && request.method==='GET') {
          await env.DB.prepare("INSERT OR IGNORE INTO sheets (id,name,created_at) VALUES ('unassigned','Unassigned',?)").bind(Date.now()).run();
          try { const orphan=await env.DB.prepare("SELECT DISTINCT COALESCE(NULLIF(sheet_id,''),'default') AS id FROM riders").all(); for(const r of (orphan.results||[])) if(r.id) await env.DB.prepare("INSERT OR IGNORE INTO sheets (id,name,created_at) VALUES (?,?,0)").bind(String(r.id),String(r.id)==='unassigned'?'Unassigned':'Sheet '+String(r.id).slice(0,6)).run(); } catch(e) {}
          const sq=await env.DB.prepare("SELECT s.id,s.name,s.created_at,COUNT(r.id) AS rider_count FROM sheets s LEFT JOIN riders r ON r.sheet_id=s.id GROUP BY s.id ORDER BY CASE WHEN s.id='unassigned' THEN 0 WHEN s.id='default' THEN 1 ELSE 2 END,s.created_at ASC").all();
          const ss=sq.results||[]; const users=me.role==='admin' ? ((await env.DB.prepare('SELECT username,role,created_at FROM users ORDER BY username COLLATE NOCASE ASC').all()).results||[]) : [];
          const wanted=url.searchParams.get('sheet')||''; const currentSheetId=wanted&&ss.some(x=>String(x.id)===String(wanted))?String(wanted):String(ss[0]?.id||'unassigned');
          const qr=await env.DB.prepare('SELECT id,name,number,plate,last,status,next,comment,tags,assigned_to,status_updated_at,comment_updated_at,next_updated_at,updated_at,updated_by,sheet_id FROM riders WHERE sheet_id=? ORDER BY created_at DESC').bind(currentSheetId).all();
          return json({user:me,sheets:ss,users,riders:qr.results||[],currentSheetId});
        }
        if(url.pathname==='/api/sheets' && request.method==='GET') {
          try { await env.DB.prepare("INSERT OR IGNORE INTO sheets (id,name,created_at) VALUES ('default','Default Sheet',0)").run(); } catch(e) {}
          try {
            const orphan=await env.DB.prepare("SELECT DISTINCT COALESCE(NULLIF(sheet_id,''),'default') AS id FROM riders").all();
            for(const r of (orphan.results||[])) {
              if(r.id && r.id!=='default') {
                await env.DB.prepare("INSERT OR IGNORE INTO sheets (id,name,created_at) VALUES (?,?,?)").bind(String(r.id),'Sheet '+String(r.id).slice(0,6),0).run();
              }
            }
          } catch(e) {}
          const {results}=await env.DB.prepare(`SELECT s.id,s.name,s.created_at,COUNT(r.id) AS rider_count FROM sheets s LEFT JOIN riders r ON r.sheet_id=s.id GROUP BY s.id ORDER BY CASE WHEN s.id='default' THEN 0 ELSE 1 END,s.created_at ASC`).all(); return json(results);
        }
        if(url.pathname.startsWith('/api/sheets/') && request.method==='PUT') {
          if(me.role!=='admin') return json({error:'Admin access required'},403);
          const id=decodeURIComponent(url.pathname.split('/').pop()); const b=await request.json(); const name=String(b.name||'').trim().slice(0,80);
          if(!name) return json({error:'Sheet name is required'},400);
          await env.DB.prepare('UPDATE sheets SET name=? WHERE id=?').bind(name,id).run(); return json({ok:true,id,name});
        }
        if(url.pathname==='/api/sheets' && request.method==='POST') {
          if(me.role!=='admin') return json({error:'Admin access required'},403);
          const b=await request.json(); const name=String(b.name||'New Sheet').trim().slice(0,80)||'New Sheet'; const id=crypto.randomUUID();
          await env.DB.prepare('INSERT INTO sheets (id,name,created_at) VALUES (?,?,?)').bind(id,name,Date.now()).run(); return json({id,name,created_at:Date.now()},201);
        }
        if(url.pathname.startsWith('/api/sheets/') && request.method==='DELETE') {
          if(me.role!=='admin') return json({error:'Admin access required'},403); const id=decodeURIComponent(url.pathname.split('/').pop());
          if(id==='default') return json({error:'Default sheet cannot be deleted'},400);
          await env.DB.batch([env.DB.prepare('DELETE FROM riders WHERE sheet_id=?').bind(id),env.DB.prepare('DELETE FROM sheets WHERE id=?').bind(id)]); return json({ok:true});
        }
        if(url.pathname==='/api/analytics' && request.method==='GET') {
          if(me.role!=='admin') return json({error:'Admin access required'},403); const sheetId=url.searchParams.get('sheet')||'default';
          const {results}=await env.DB.prepare('SELECT status,next,comment FROM riders WHERE sheet_id=?').bind(sheetId).all(); const now=new Date();
          const today=now.toISOString().slice(0,10); const stats={total:results.length,pending:0,answered:0,noanswer:0,busy:0,comments:0,dueToday:0,overdue:0};
          for(const r of results){ if(r.status==='Pending')stats.pending++; if(r.status==='Answered')stats.answered++; if(r.status==='No Answer')stats.noanswer++; if(r.status==='Busy')stats.busy++; if(String(r.comment||'').trim())stats.comments++; if(r.next===today)stats.dueToday++; if(r.next && r.next<today)stats.overdue++; }
          const {results:performance}=await env.DB.prepare(`SELECT username, SUM(CASE WHEN action='status' AND new_value='Answered' THEN 1 ELSE 0 END) answered, SUM(CASE WHEN action='status' THEN 1 ELSE 0 END) status_updates, COUNT(*) total_updates FROM call_history WHERE sheet_id=? GROUP BY username ORDER BY total_updates DESC`).bind(sheetId).all();
          return json({stats,performance});
        }
        if(url.pathname==='/api/riders' && request.method==='GET') {
          const sheetId=url.searchParams.get('sheet')||'default';
          const {results}=await env.DB.prepare('SELECT id,name,number,plate,last,status,next,comment,tags,assigned_to,status_updated_at,comment_updated_at,next_updated_at,updated_at,updated_by FROM riders WHERE sheet_id=? ORDER BY created_at DESC').bind(sheetId).all(); return json(results);
        }
        if(url.pathname==='/api/riders' && request.method==='DELETE') {
          if(me.role!=='admin') return json({error:'Admin access required'},403); const sheetId=url.searchParams.get('sheet')||'default'; await env.DB.prepare('DELETE FROM riders WHERE sheet_id=?').bind(sheetId).run(); return json({ok:true});
        }
        if(url.pathname==='/api/riders' && request.method==='POST') {
          if(me.role!=='admin') return json({error:'Admin access required'},403); const b=await request.json(); const id=crypto.randomUUID(); const sheetId=String(b.sheetId||'default');
          const now=Date.now(); const status=b.status||'Pending';
          await env.DB.prepare('INSERT INTO riders (id,name,number,plate,last,status,next,comment,tags,created_at,sheet_id,status_updated_at,comment_updated_at,next_updated_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,b.name||'',b.number||'',b.plate||'',b.last||'',status,b.next||'',b.comment||'',b.tags||'',now,sheetId,now,b.comment?now:0,b.next?now:0,now,me.username).run();
          return json({id,name:b.name||'',number:b.number||'',plate:b.plate||'',last:b.last||'',status,next:b.next||'',comment:b.comment||'',tags:b.tags||'',status_updated_at:now,comment_updated_at:b.comment?now:0,next_updated_at:b.next?now:0,updated_at:now,updated_by:me.username},201);
        }
        if((url.pathname==='/api/riders/assign-sheet-count' || url.pathname==='/api/riders/assign-user-count') && request.method==='POST') {
          if(me.role!=='admin') return json({error:'Admin access required'},403); const b=await request.json(); const count=Math.max(1,Math.min(10000,Number(b.count||0))); const target=String(b.targetSheet||'').trim();
          if(!Number.isFinite(count)||count<1) return json({error:'Enter a valid rider count'},400); if(!target||target==='unassigned') return json({error:'Select a destination sheet'},400);
          const sh=await env.DB.prepare('SELECT id,name FROM sheets WHERE id=?').bind(target).first(); if(!sh)return json({error:'Destination sheet not found'},404);
          const q=await env.DB.prepare("SELECT id FROM riders WHERE sheet_id='unassigned' ORDER BY created_at ASC LIMIT ?").bind(count).all(); const ids=(q.results||[]).map(x=>String(x.id)); if(!ids.length)return json({ok:true,count:0,requested:count,targetSheet:target,targetName:sh.name});
          const now=Date.now(); const batch=ids.map(id=>env.DB.prepare("UPDATE riders SET sheet_id=?,assigned_to='',updated_at=?,updated_by=? WHERE id=? AND sheet_id='unassigned'").bind(target,now,me.username,id)); for(let i=0;i<batch.length;i+=50)await env.DB.batch(batch.slice(i,i+50));
          return json({ok:true,count:ids.length,requested:count,targetSheet:target,targetName:sh.name});
        }
        if(url.pathname==='/api/riders/assign-user' && request.method==='POST') {
          if(me.role!=='admin') return json({error:'Admin access required'},403);
          const b=await request.json();
          const ids=Array.isArray(b.ids)?b.ids.map(String).filter(Boolean):[];
          const username=String(b.username||'').trim();
          if(!ids.length) return json({error:'No riders selected'},400);
          if(!username) return json({error:'Select a user'},400);
          const u=await env.DB.prepare('SELECT username FROM users WHERE username=?').bind(username).first();
          if(!u) return json({error:'User not found'},404);
          const now=Date.now();
          for(let i=0;i<ids.length;i+=50){
            const batch=ids.slice(i,i+50).map(id=>env.DB.prepare('UPDATE riders SET assigned_to=?,updated_at=?,updated_by=? WHERE id=?').bind(username,now,me.username,id));
            if(batch.length) await env.DB.batch(batch);
          }
          return json({ok:true,count:ids.length,username});
        }
        if(url.pathname.match(/^\/api\/riders\/[^/]+$/) && request.method==='PUT') {
          const id=decodeURIComponent(url.pathname.split('/').pop());
          const b=await request.json();
          const allowed=me.role==='admin' ? ['name','number','plate','last','status','next','comment','tags','sheet_id','assigned_to'] : ['comment','status','next','tags'];
          const current=await env.DB.prepare('SELECT * FROM riders WHERE id=?').bind(id).first();
          if(!current) return json({error:'Rider not found'},404);
          const now=Date.now();
          const sets=[]; const vals=[]; const history=[];
          for(const key of allowed){
            if(!(key in b)) continue;
            const old=String(current[key]??''); const value=String(b[key]??'');
            if(old===value) continue;
            sets.push(key+'=?'); vals.push(value);
            if(key==='status') history.push(['status',old,value]);
            if(key==='comment') history.push(['comment',old,value]);
            if(key==='next') history.push(['next',old,value]);
            if(key==='tags') history.push(['tags',old,value]);
            if(key==='sheet_id') history.push(['sheet_id',old,value]);
          }
          if(!sets.length) {
            try { await env.DB.prepare('INSERT INTO call_history (id,rider_id,username,sheet_id,action,old_value,new_value,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,me.username,String(current.sheet_id||'default'),'save','',String(current.updated_at||''),now).run(); } catch(e) {}
            return json({...current});
          }
          if(sets.includes('status=?')) { sets.push('status_updated_at=?'); vals.push(now); }
          if(sets.includes('comment=?')) { sets.push('comment_updated_at=?'); vals.push(now); }
          if(sets.includes('next=?')) { sets.push('next_updated_at=?'); vals.push(now); }
          sets.push('updated_at=?'); vals.push(now);
          sets.push('updated_by=?'); vals.push(me.username);
          vals.push(id);
          await env.DB.prepare('UPDATE riders SET '+sets.join(',')+' WHERE id=?').bind(...vals).run();
          for(const h of history){ await env.DB.prepare('INSERT INTO call_history (id,rider_id,username,sheet_id,action,old_value,new_value,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,me.username,String(b.sheet_id||current.sheet_id||'default'),h[0],h[1],h[2],now).run(); }
          const updated=await env.DB.prepare('SELECT id,name,number,plate,last,status,next,comment,tags,status_updated_at,comment_updated_at,next_updated_at,updated_at,updated_by,sheet_id FROM riders WHERE id=?').bind(id).first();
          return json(updated);
        }
        if(url.pathname==='/api/riders/bulk' && request.method==='POST') {
          if(me.role!=='admin') return json({error:'Admin access required'},403); const b=await request.json(); const list=Array.isArray(b.rows)?b.rows:[]; if(!list.length)return json({ok:true,count:0,skipped:0});
          const existing=(await env.DB.prepare("SELECT number FROM riders WHERE number IS NOT NULL AND TRIM(number)<>''").all()).results||[]; const seen=new Set(existing.map(x=>String(x.number||'').replace(/\D/g,'')).filter(Boolean)); const stmts=[]; let skipped=0; const now=Date.now();
          for(const r of list){ const number=String(r.number||'').trim(); const key=number.replace(/\D/g,''); if(key&&seen.has(key)){skipped++;continue;} if(key)seen.add(key); const id=crypto.randomUUID(); stmts.push(env.DB.prepare('INSERT INTO riders (id,name,number,plate,last,status,next,comment,tags,created_at,sheet_id,status_updated_at,comment_updated_at,next_updated_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,r.name||'',number,r.plate||'',r.last||'',r.status||'Pending',r.next||'',r.comment||'',r.tags||'',now,'unassigned',now,r.comment?now:0,r.next?now:0,now,me.username)); }
          for(let i=0;i<stmts.length;i+=50)await env.DB.batch(stmts.slice(i,i+50)); return json({ok:true,count:stmts.length,skipped});
        }
        if(url.pathname.match(/^\/api\/riders\/[^/]+\/history$/) && request.method==='GET') {
          const id=url.pathname.split('/')[3];
          let results=[]; try { const q=await env.DB.prepare('SELECT id,rider_id,username,sheet_id,action,old_value,new_value,created_at FROM call_history WHERE rider_id=? ORDER BY created_at DESC').bind(id).all(); results=q.results||[]; } catch(e) {}
          return json({history:results});
        }
        return json({error:'API route not found'},404);
      }
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return new Response('Assets binding is not configured. Check wrangler.toml.', {status:500, headers:{'Content-Type':'text/plain; charset=UTF-8'}});
    } catch (e) {
      return json({error:e.message},500);
    }
  }
};
