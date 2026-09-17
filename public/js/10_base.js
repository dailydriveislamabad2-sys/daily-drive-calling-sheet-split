
(function(){
  const _toast=window.toast;
  window.toast=function(msg){
    const el=document.getElementById('toast'); if(!el)return;
    let text=String(msg??'');
    text=text.replace(/<!doctype html>[\s\S]*$/i,'Cloudflare Worker error. Please check Worker Logs.');
    text=text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    if(text.length>220) text=text.slice(0,217)+'…';
    el.textContent=text;
    el.style.display='block';
    clearTimeout(window._toast);
    window._toast=setTimeout(()=>el.style.display='none',3500);
  };
  window.todayFollowups=function(){
    const d=new Date();
    const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    const dateEl=document.getElementById('dateFilter'); if(dateEl)dateEl.value=local;
    if(typeof window.render==='function')window.render();
    window.toast("Today's follow-ups loaded");
  };
  window.switchSheet=async function(id){
    currentSheetId=id;
    localStorage.setItem('dd_current_sheet',id);
    const df=document.getElementById('dateFilter'); if(df)df.value='';
    const sf=document.getElementById('search'); if(sf)sf.value='';
    const ff=document.getElementById('filter'); if(ff)ff.value='';
    try{await loadSheets();window.toast('Sheet opened');}catch(e){window.toast('Sheet error: '+e.message)}
  };
  window.showHistory=async function(id){
    const m=document.getElementById('historyModal'),c=document.getElementById('historyContent');
    if(!m||!c)return;
    m.classList.add('show'); c.innerHTML='<div class="history-item"><b>Loading history…</b></div>';
    try{
      const d=await api('/api/riders/'+encodeURIComponent(id)+'/history');
      const list=Array.isArray(d)?d:(Array.isArray(d?.history)?d.history:[]);
      c.innerHTML=list.length?list.map(h=>`<div class="history-item"><b>${esc(h.action==='status'?'☎ Status Update':h.action==='comment'?'💬 Comment Update':h.action==='next'?'📅 Next Call Date':h.action==='tags'?'🏷 Tags':h.action==='save'?'💾 Rider Saved':'✎ '+h.action)}</b><div>${esc(h.new_value||'—')}</div><small>${esc(h.username||'—')} • ${esc(fmtStamp(h.created_at))}</small></div>`).join(''):'<div class="empty">No history recorded yet.</div>';
    }catch(e){c.innerHTML='<div class="history-item"><b>Unable to load history</b><small>Please try again.</small></div>';window.toast('History error: '+e.message)}
  };
  window.saveOne=async function(id){
    if(currentRole!=='admin')return;
    const r=rows.find(x=>x.id===id);if(!r)return;
    try{const d=await api('/api/riders/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(r)});Object.assign(r,d);window.toast('Rider saved permanently to D1');window.render();}
    catch(e){window.toast('Save error: '+e.message)}
  };
  window.doLogout=async function(){
    const ok=await (window.openUI3D?openUI3D({icon:'⎋',title:'Logout',message:'Kya aap apne Daily Drive account se logout karna chahte hain?',input:false,confirmText:'Logout',danger:true}):true);
    if(!ok)return;
    try{await fetch('/api/logout',{method:'POST',credentials:'same-origin'});}catch(e){}
    localStorage.removeItem('dd_current_sheet');
    showLogin();
  };
  window.renderProfessional=function(){
    const q=document.getElementById('search')?.value.trim().toLowerCase()||'',f=document.getElementById('filter')?.value||'',dt=document.getElementById('dateFilter')?.value||'';
    const data=rows.filter(r=>(!f||r.status===f)&&(!dt||r.next===dt)&&Object.values(r).join(' ').toLowerCase().includes(q));
    const body=document.getElementById('ridersBody');if(!body)return;
    body.innerHTML=data.map((r,i)=>{
      const p=priorityInfo(r),tags=tagsArr(r),sr=smartReason(r);
      const pc=p.days===null?'':`<span class="priority ${p.cls}">${p.level} • ${p.days}d</span>`;
      const tagHtml=tags.length?`<div class="tags">${tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:'';
      const hist=`<button class="btn history-btn" onclick="showHistory('${esc(r.id)}')">📝 History</button>`;
      const edit=`<button class="btn edit" onclick="openComment('${esc(r.id)}')">✎ Edit</button>`;
      const tag=`<button class="tag-btn" onclick="editTags('${esc(r.id)}')">🏷 Tags</button>`;
      return `<tr><td class="check-cell"><input class="assign-check" type="checkbox" data-id="${esc(r.id)}" onchange="updateSelectedCount()"></td><td>${i+1}</td><td><div class="person"><div class="avatar">${esc(initials(r.name))}</div><div class="name read-value">${esc(r.name||'—')} ${pc}${tagHtml}</div></div></td><td class="number-cell read-value">${esc(r.number||'—')}</td><td class="last-trip-cell read-value">${esc(r.last||'—')}</td><td class="status-cell"><div class="status-menu-wrap"><button type="button" class="status-trigger ${r.status==='Answered'?'answered':r.status==='No Answer'?'noanswer':r.status==='Busy'?'busy':'pending'}" onclick="toggleStatusMenu(event,'${esc(r.id)}')"><span>${r.status==='Answered'?'☎':r.status==='No Answer'?'✕':r.status==='Busy'?'☏':'◷'} &nbsp;${esc(r.status||'Pending')}</span><span class="chev">⌄</span></button><div class="status-menu" id="statusMenu-${esc(r.id)}">${['Pending','Answered','No Answer','Busy'].map(x=>`<button type="button" class="status-option ${x==='Answered'?'answered':x==='No Answer'?'noanswer':x==='Busy'?'busy':'pending'} ${x===r.status?'active':''}" onclick="setStatus('${esc(r.id)}','${x}')">${x==='Answered'?'☎':x==='No Answer'?'✕':x==='Busy'?'☏':'◷'} &nbsp; ${x}</button>`).join('')}</div><span class="read-value status-read status-read-${r.status==='Answered'?'answered':r.status==='No Answer'?'noanswer':r.status==='Busy'?'busy':'pending'}">${r.status==='Answered'?'☎':r.status==='No Answer'?'✕':r.status==='Busy'?'☏':'◷'} &nbsp;${esc(r.status||'Pending')}</span>${r.status_updated_at?`<span class="update-meta">Updated ${esc(fmtStamp(r.status_updated_at))}</span>`:''}</div></td><td><input class="next-call" type="date" value="${esc(r.next||'')}" onchange="upd('${esc(r.id)}','next',this.value)"><span class="read-value next-read">${esc(r.next||'—')}</span>${r.next_updated_at?`<span class="update-meta">Set ${esc(fmtStamp(r.next_updated_at))}</span>`:''}</td><td class="comment"><div class="commentbox read-value">${esc(r.comment||'No comment')}</div>${r.comment_updated_at?`<span class="update-meta">Updated ${esc(fmtStamp(r.comment_updated_at))}</span>`:''}<div class="comment-tools">${edit}${tag}${hist}</div></td><td>${wa(r.number)?`<a class="btn wa" target="_blank" href="${wa(r.number)}">🟢 WhatsApp</a>`:'—'}</td><td><div class="actions-cell"><button class="btn assign-btn admin-only" onclick="assignOne('${esc(r.id)}')">↔ Assign</button><button class="btn saveone admin-only" onclick="saveOne('${esc(r.id)}')">💾 Save</button></div><div class="smart-reason">${esc(sr)}</div></td></tr>`;
    }).join('')||'<tr><td colspan="10" class="empty">No matching riders found.</td></tr>';
    stats();document.getElementById('showing').textContent=`Showing ${data.length} of ${rows.length} riders`;applyRoleUI();updateSelectedCount();
  };
  const oldR=window.render;
  window.render=function(){return window.renderProfessional();};
  const oldLoadSheets=window.loadSheets;
  if(oldLoadSheets)window.loadSheets=async function(){await oldLoadSheets();if(typeof render==='function')render();};
})();
