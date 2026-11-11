(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var REDUCED=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var REPO='kosandra0/Piano_Logger';
var API='https://api.github.com/repos/'+REPO+'/releases?per_page=100';
var LATEST_EXE='https://github.com/'+REPO+'/releases/latest/download/Piano-Logger-Setup.exe';

/* ---------- nav ---------- */
var nav=$('#nav'),links=$('#links'),burger=$('#burger'),ind=$('#indicator');
function onScroll(){nav.classList.toggle('scrolled',window.scrollY>20)}
window.addEventListener('scroll',onScroll,{passive:true});onScroll();
function setMenu(o){links.classList.toggle('open',o);burger.setAttribute('aria-expanded',o);burger.setAttribute('aria-label',o?'Close menu':'Open menu')}
burger.addEventListener('click',function(){setMenu(!links.classList.contains('open'))});
$$('a',links).forEach(function(a){a.addEventListener('click',function(){setMenu(false)})});
document.addEventListener('keydown',function(e){if(e.key==='Escape')setMenu(false)});
var navLinks=$$('.links>a');
function moveInd(a){
  if(!a||getComputedStyle(ind).display==='none')return;
  ind.style.width=a.offsetWidth+'px';ind.style.transform='translateX('+a.offsetLeft+'px)';ind.style.opacity=1;
}
var secs=$$('[data-section]');
var secMap={compare:'features',downloads:'downloads'};
function setActive(id){
  id=secMap[id]&&id==='compare'?'features':id;
  var cur=null;navLinks.forEach(function(a){var on=a.getAttribute('href')==='#'+id;a.classList.toggle('on',on);if(on){cur=a;a.setAttribute('aria-current','true')}else a.removeAttribute('aria-current')});
  moveInd(cur);
}
var vis={};
var so=new IntersectionObserver(function(es){
  es.forEach(function(e){vis[e.target.id]=e.isIntersecting?e.intersectionRatio:0});
  var best=null,bv=0;for(var k in vis){if(vis[k]>bv){bv=vis[k];best=k}}
  if(best)setActive(best);
},{rootMargin:'-30% 0px -50% 0px',threshold:[0,.1,.5,1]});
secs.forEach(function(s){so.observe(s)});
window.addEventListener('resize',function(){moveInd($('.links>a.on'))});

/* ---------- reveal & counters ---------- */
function count(el){
  var t=+el.dataset.count;if(REDUCED){el.textContent=t.toLocaleString();return}
  var s=performance.now(),d=1600;
  (function f(n){var p=Math.min(1,(n-s)/d),e=1-Math.pow(1-p,3);el.textContent=Math.round(t*e).toLocaleString();if(p<1)requestAnimationFrame(f)})(s);
}
var ro=new IntersectionObserver(function(es){
  es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');$$('[data-count]',e.target).forEach(count);ro.unobserve(e.target)}});
},{threshold:.12});
$$('.reveal').forEach(function(el){ro.observe(el)});

/* ---------- piano ---------- */
var AC=null;
function tone(midi){
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    var o=AC.createOscillator(),g=AC.createGain(),f=440*Math.pow(2,(midi-69)/12);
    o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.0001,AC.currentTime);g.gain.exponentialRampToValueAtTime(.18,AC.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+1.1);
    o.connect(g).connect(AC.destination);o.start();o.stop(AC.currentTime+1.15);
  }catch(e){}
}
var BLACK={1:1,3:1,6:1,8:1,10:1};
function buildKb(el,start,whites,interactive){
  var wk=[],midi=start,frag=document.createDocumentFragment(),pos=0,els={};
  var list=[];
  while(wk.length<whites){ if(!BLACK[midi%12]){wk.push(midi)} list.push(midi); midi++; }
  var w=100/whites,idx=0;
  list.forEach(function(m){
    if(!BLACK[m%12]){
      var k=document.createElement('div');k.className='wk';k.dataset.m=m;k.style.cssText='';frag.appendChild(k);els[m]=k;idx++;
    }
  });
  el.appendChild(frag);
  var i=0;
  list.forEach(function(m){
    if(!BLACK[m%12]){i++;return}
    if(i>=whites)return;
    var b=document.createElement('div');b.className='bk';b.dataset.m=m;b.style.left=(i*w-w*.3)+'%';b.style.width=(w*.6)+'%';el.appendChild(b);els[m]=b;
  });
  if(interactive){
    var down=function(e){var t=e.target.closest('[data-m]');if(!t)return;e.preventDefault();var m=+t.dataset.m;t.classList.add('dn');tone(m);setTimeout(function(){t.classList.remove('dn')},260)};
    el.addEventListener('pointerdown',down);
  }
  el._w=whites;el._pos=function(m){var e=els[m];if(!e)return null;var r=e.getBoundingClientRect(),p=el.getBoundingClientRect();return {x:(r.left-p.left)/p.width*100,w:r.width/p.width*100,el:e,black:e.classList.contains('bk')}};
  el._els=els;el._notes=Object.keys(els).map(Number);
  return el;
}
function lightKey(kbEl,m){var e=kbEl._els&&kbEl._els[m];if(e){e.classList.add('dn');setTimeout(function(){e.classList.remove('dn')},240)}}
function startFall(roll,kbEl,interval,notes){
  if(REDUCED||roll._fall)return;
  roll._fall=true;
  var timer=null,inView=false,pat=notes||[60,64,67,72,71,67,64,62,65,69,74,72,60,67,76,64];
  var step=0;
  function spawn(){
    var chord=[pat[step%pat.length]];if(step%5===0)chord.push(pat[(step+3)%pat.length]);
    step++;
    chord.forEach(function(m){
      var ps=kbEl._pos(m);if(!ps)return;
      var n=document.createElement('div');n.className='fn';
      n.style.left=ps.x+'%';n.style.width=(ps.w*(ps.black?1:.8))+'%';n.style.height=(30+Math.random()*50)+'px';
      var h=roll.clientHeight||130,dur=1500;
      roll.appendChild(n);
      var a=n.animate([{transform:'translateY(0)'},{transform:'translateY('+(h+70)+'px)'}],{duration:dur,easing:'cubic-bezier(.4,0,.9,.7)'});
      a.onfinish=function(){n.remove()};
      setTimeout(function(){lightKey(kbEl,m);if(roll._onHit)roll._onHit()},dur*.78);
    });
  }
  function sync(){
    var go=inView&&!document.hidden;
    if(go&&!timer)timer=setInterval(spawn,interval);
    else if(!go&&timer){clearInterval(timer);timer=null}
  }
  new IntersectionObserver(function(es){inView=es[0].isIntersecting;sync()}).observe(roll);
  document.addEventListener('visibilitychange',sync);
}
var hk=$('#heroKb');buildKb(hk,48,28,true);
var heroRoll=$('#heroFall'),hits=0,lifeEl=$('#liveLife'),todayEl=$('#liveToday'),lifeBase=128450,todayBase=1842;
heroRoll._onHit=function(){hits++;if(lifeEl){lifeEl.textContent=(lifeBase+hits).toLocaleString();lifeEl.dataset.count=lifeBase+hits}if(todayEl)todayEl.textContent=(todayBase+hits).toLocaleString();
  var c=lifeEl&&lifeEl.parentNode;if(c&&!REDUCED){c.classList.remove('tick');void c.offsetWidth;c.classList.add('tick')}};
startFall(heroRoll,hk,520);
/* live average speed: smooth drift between 3.4 and 5.0 keys/s */
(function(){
  var el=$('#liveSpeed');if(!el)return;
  var cur=4.2,target=4.2,nextAt=0,t0=0;
  function tick(now){
    if(!t0)t0=now;
    if(now>=nextAt){target=3.4+Math.random()*1.6;nextAt=now+2200+Math.random()*2600}
    cur+=(target-cur)*0.06;
    el.textContent=cur.toFixed(1)+'/s';
    if(!document.hidden&&!REDUCED&&!el.closest('.off'))setTimeout(function(){requestAnimationFrame(tick)},250);
    else setTimeout(function(){requestAnimationFrame(tick)},1000);
  }
  if(REDUCED)return;
  requestAnimationFrame(tick);
})();
var dk=$('#deskKb');
if(dk){buildKb(dk,48,21,true);startFall($('#deskFall'),dk,780,[60,64,67,65,69,72,71,67,62,65,69,74,72,69,64,60]);}
$$('.slide').forEach(function(s){
  var kb=$('[data-kb]',s),rl=$('[data-fall]',s);
  if(kb){buildKb(kb,48,21,true);if(rl)startFall(rl,kb,640,[60,62,64,65,67,69,71,72,71,69,67,65,64,62]);}
  else if(rl){var k2=$('.kb2',s)||document.createElement('div');if(!k2.parentNode){k2.className='kb';rl.parentNode.insertBefore(k2,rl.nextSibling)}k2.className='kb';k2.innerHTML='';buildKb(k2,48,21,false);startFall(rl,k2,700,[62,65,69,74,72,69,65,62]);}
});

/* ---------- preview switcher ---------- */
var tabs=[$('#tab-web'),$('#tab-desk')],panes=[$('#pane-web'),$('#pane-desk')],segBg=$('.seg-bg');
function selTab(i){
  tabs.forEach(function(t,j){t.classList.toggle('on',i===j);t.setAttribute('aria-selected',i===j);t.tabIndex=i===j?0:-1;panes[j].hidden=i!==j;panes[j].classList.toggle('on',i===j)});
  segBg.style.width=tabs[i].offsetWidth+'px';segBg.style.transform='translateX('+(tabs[i].offsetLeft-5)+'px)';
}
tabs.forEach(function(t,i){t.addEventListener('click',function(){selTab(i)});t.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowLeft'){var n=1-i;selTab(n);tabs[n].focus()}})});
window.addEventListener('resize',function(){selTab(tabs[0].classList.contains('on')?0:1)});
selTab(0);
$('#loadFrame').addEventListener('click',function(){
  var f=document.createElement('iframe');f.src='https://kosandra0.github.io/Piano_Logger/';f.title='Piano Logger web application (live preview)';f.loading='lazy';f.allow='midi; microphone';
  $('#frame').appendChild(f);$('#frameCover').remove();
});

/* ---------- carousel ---------- */
(function(){
  var car=$('#carousel'),track=$('#track'),slides=$$('.slide',track),dots=$('#dots'),cur=0,x0=null,dx=0;
  slides.forEach(function(s,i){
    var b=document.createElement('button');b.setAttribute('role','tab');b.setAttribute('aria-label','Go to feature '+(i+1)+': '+$('h3',s).textContent);b.addEventListener('click',function(){go(i)});dots.appendChild(b);
  });
  function go(i){
    cur=(i+slides.length)%slides.length;
    track.style.transform='translateX('+(-cur*100)+'%)';
    slides.forEach(function(s,j){s.classList.toggle('cur',j===cur);s.setAttribute('aria-hidden',j!==cur)});
    $$('button',dots).forEach(function(b,j){b.setAttribute('aria-selected',j===cur)});
  }
  $('#prev').addEventListener('click',function(){go(cur-1)});$('#next').addEventListener('click',function(){go(cur+1)});
  car.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'){go(cur-1);e.preventDefault()}else if(e.key==='ArrowRight'){go(cur+1);e.preventDefault()}});
  track.addEventListener('pointerdown',function(e){if(e.target.closest('.kb'))return;x0=e.clientX;dx=0;track.style.transition='none'});
  window.addEventListener('pointermove',function(e){if(x0===null)return;dx=e.clientX-x0;track.style.transform='translateX(calc('+(-cur*100)+'% + '+dx+'px))'});
  function end(){if(x0===null)return;track.style.transition='';var t=Math.min(120,car.offsetWidth*.15);x0=null;if(dx<-t)go(cur+1);else if(dx>t)go(cur-1);else go(cur)}
  window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
  go(0);
})();


/* ---------- polish: stagger indices, pausing, smooth accordions, copy ---------- */
function setIdx(sel){$$(sel).forEach(function(e,i){e.style.setProperty('--i',i)})}
['.ticks li','.log .lr:not(.h)','.dash .chart i','.sw','.grid4 .card','.card.social','.faq details','.values li','.desk-feats li'].forEach(setIdx);
secs.forEach(function(sec){new IntersectionObserver(function(es){sec.classList.toggle('off',!es[0].isIntersecting)},{rootMargin:'120px 0px'}).observe(sec)});
document.addEventListener('visibilitychange',function(){document.documentElement.classList.toggle('tab-hidden',document.hidden)});

function toggleDetails(d){
  var sm=d.firstElementChild,b=sm&&sm.nextElementSibling;if(!b){d.open=!d.open;return}
  if(d._a){d._a.cancel();d._a=null}
  var opening=d._closing||!d.open,ease='cubic-bezier(.22,1,.36,1)';
  b.style.overflow='hidden';
  if(opening){d.open=true;d._closing=false;var h=b.scrollHeight;d._a=b.animate([{height:'0px',opacity:0},{height:h+'px',opacity:1}],{duration:320,easing:ease})}
  else{d._closing=true;var h2=b.offsetHeight;d._a=b.animate([{height:h2+'px',opacity:1},{height:'0px',opacity:0}],{duration:260,easing:ease})}
  d._a.onfinish=function(){b.style.overflow='';if(d._closing){d.open=false;d._closing=false}d._a=null};
}
document.addEventListener('click',function(e){
  var sm=e.target.closest('.faq details>summary, details.rel>summary');
  if(!sm||REDUCED||!sm.parentNode.animate)return;
  if(e.target.closest('a'))return;
  e.preventDefault();toggleDetails(sm.parentNode);
});

function copyText(t){
  if(navigator.clipboard&&window.isSecureContext){return navigator.clipboard.writeText(t).then(function(){return true},function(){return legacy(t)})}
  return Promise.resolve(legacy(t));
}
function legacy(t){
  try{var a=document.createElement('textarea');a.value=t;a.setAttribute('readonly','');a.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(a);a.select();var ok=document.execCommand('copy');a.remove();return ok}catch(e){return false}
}
$$('.copy[data-copy]').forEach(function(b){
  var label=b.textContent,tm;
  b.addEventListener('click',function(ev){
    ev.stopPropagation();
    copyText(b.dataset.copy).then(function(ok){
      b.classList.remove('ok','bad');b.classList.add(ok?'ok':'bad');
      b.textContent=ok?'Copied!':'Copy failed';
      $('#copyStatus').textContent=ok?('Copied '+b.dataset.copy):('Could not copy automatically. The username is '+b.dataset.copy);
      clearTimeout(tm);tm=setTimeout(function(){b.textContent=label;b.classList.remove('ok','bad')},2000);
    });
  });
});

/* ---------- GitHub releases ---------- */
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fmtDate(iso){try{return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})}catch(e){return iso}}
function fmtSize(b){return b>1048576?(b/1048576).toFixed(1)+' MB':Math.round(b/1024)+' KB'}
function safeUrl(u){return /^https:\/\/github\.com\//.test(u)?u:'#'}
function inline(t){return esc(t).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\s][^*]*)\*/g,'<em>$1</em>').replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')}
function md(src){
  var out=[],ul=false;
  String(src||'').replace(/\r/g,'').split('\n').forEach(function(l){
    var m;
    if((m=/^\s*[-*]\s+(.*)/.exec(l))){if(!ul){out.push('<ul>');ul=true}out.push('<li>'+inline(m[1])+'</li>');return}
    if(ul){out.push('</ul>');ul=false}
    if((m=/^#{1,6}\s+(.*)/.exec(l)))out.push('<h4>'+inline(m[1])+'</h4>');
    else if(l.trim())out.push('<p>'+inline(l)+'</p>');
  });
  if(ul)out.push('</ul>');return out.join('');
}
function title(r){return (r.name||r.tag_name||'').trim()}
function ver(r){var m=/(\d+(?:\.\d+)+)/.exec(r.tag_name||'');return m?m[1]:(r.tag_name||'')}
function exeAsset(r){
  var a=(r.assets||[]).filter(function(x){return /\.exe$/i.test(x.name)});
  return a.filter(function(x){return x.name==='Piano-Logger-Setup.exe'})[0]||a[0]||null;
}
function shaOf(r){
  var f=(r.assets||[]).filter(function(x){return /sha-?256/i.test(x.name)})[0];
  var m=/SHA-?256[^`\n]*`([0-9a-f]{64})`/i.exec(r.body||'');
  return {url:f?f.browser_download_url:null,hash:m?m[1]:null};
}
function summary(r){
  var lines=String(r.body||'').replace(/\r/g,'').split('\n').map(function(l){return l.replace(/^#+\s*/,'').replace(/[*_`]/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').trim()}).filter(Boolean);
  var l=lines.filter(function(x){return !/^download\b/i.test(x)&&!/^sha-?256/i.test(x)})[0]||lines[0]||'';
  return l.length>150?l.slice(0,147)+'…':l;
}
function getReleases(){
  try{var c=JSON.parse(sessionStorage.getItem('pl-rel')||'null');if(c&&Date.now()-c.t<600000)return Promise.resolve(c.d)}catch(e){}
  return fetch(API,{headers:{Accept:'application/vnd.github+json'}}).then(function(r){if(!r.ok)throw new Error('GitHub API '+r.status);return r.json()}).then(function(d){
    d=d.filter(function(r){return !r.draft});
    try{sessionStorage.setItem('pl-rel',JSON.stringify({t:Date.now(),d:d}))}catch(e){}
    return d;
  });
}

var ALL=[],shown=0,PAGE=8,query='';
var vlist=$('#vlist'),vmore=$('#vmore'),vcount=$('#vcount');

function relCard(r,isLatest){
  var exe=exeAsset(r),sha=shaOf(r),el=document.createElement('details');el.className='rel';
  var dl=exe?'<a class="btn btn-primary btn-sm" href="'+esc(exe.browser_download_url)+'"><svg class="ic"><use href="#i-down"/></svg>Download '+esc(exe.name)+' ('+fmtSize(exe.size)+')</a>':'<span class="fine">No installer attached to this release.</span>';
  el.innerHTML='<summary><span class="v">'+esc(title(r)||ver(r))+'</span>'+(isLatest?'<span class="pill">Latest</span>':'')+(r.prerelease?'<span class="pill pre">Pre-release</span>':'')+'<span class="dt">'+esc(fmtDate(r.published_at||r.created_at))+'</span><span class="sum">'+esc(summary(r))+'</span><svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>'
   +'<div class="body"><div class="notes">'+(md(r.body)||'<p>No release notes provided.</p>')+'</div><div class="acts">'+dl+'<a class="btn btn-ghost btn-sm" href="'+esc(safeUrl(r.html_url))+'" target="_blank" rel="noopener">View full release notes <svg class="ic"><use href="#i-ext"/></svg></a></div>'+(sha.hash?'<p class="sha">SHA-256: '+esc(sha.hash)+'</p>':'')+'</div>';
  return el;
}
function filtered(){
  var q=query.toLowerCase();
  return q?ALL.filter(function(r){return ((r.name||'')+' '+(r.tag_name||'')+' '+(r.body||'')).toLowerCase().indexOf(q)>-1}):ALL;
}
function render(reset){
  var list=filtered();
  if(reset){vlist.innerHTML='';shown=0}
  var next=list.slice(shown,shown+PAGE);
  next.forEach(function(r,i){var c=relCard(r,r===ALL[0]);c.style.setProperty('--i',i);vlist.appendChild(c)});
  shown+=next.length;
  vmore.hidden=shown>=list.length;
  vcount.textContent=list.length+(list.length===1?' release':' releases');
  if(!list.length)vlist.innerHTML='<div class="err">No releases match “'+esc(query)+'”.</div>';
}
vmore.addEventListener('click',function(){render(false)});
var qt;$('#vq').addEventListener('input',function(e){clearTimeout(qt);qt=setTimeout(function(){query=e.target.value.trim();render(true)},180)});

function fail(msg){
  var html='<div class="err"><p><strong>Couldn’t load releases from GitHub.</strong><br>'+esc(msg)+'</p><p><a class="btn btn-ghost" href="https://github.com/'+REPO+'/releases" target="_blank" rel="noopener">Open the official releases page</a></p></div>';
  vlist.innerHTML=html;vmore.hidden=true;vcount.textContent='';
  $('#dlState').textContent='Couldn’t load live release details. The download button below still points to the official latest installer.';
  $('#hero-release').textContent='Latest release: see GitHub';
}

function latestUI(r){
  var exe=exeAsset(r),sha=shaOf(r),v=ver(r);
  $('#dlState').textContent='Latest release';
  $('#dlTitle').textContent=title(r)||('Piano Logger '+v);
  $('#hero-release').textContent='Latest release: v'+v+' · '+fmtDate(r.published_at);
  $('#hero-ver').textContent='Version '+v;
  var meta=[['Version','v'+v],['Released',fmtDate(r.published_at)],['Platform','Windows 10 / 11 · 64-bit']];
  if(exe){meta.push(['Installer',exe.name]);meta.push(['File size',fmtSize(exe.size)]);if(exe.download_count!=null)meta.push(['Downloads (this file)',exe.download_count.toLocaleString()])}
  if(sha.hash)meta.push(['SHA-256',sha.hash]);
  $('#dlMeta').innerHTML=meta.map(function(m){return '<div><dt>'+esc(m[0])+'</dt><dd>'+esc(m[1])+'</dd></div>'}).join('');
  var btn=$('#dlBtn');btn.href=exe?exe.browser_download_url:LATEST_EXE;
  $('#dlNotes').href=safeUrl(r.html_url);$('#dlGh').href=safeUrl(r.html_url);
  var s=$('#dlSha');if(sha.url){s.href=sha.url;s.hidden=false}else if(sha.hash){s.href=safeUrl(r.html_url);s.textContent='SHA-256 in release notes';s.hidden=false}
  var same=/Windows app (?:is )?(?:the same as|unchanged(?: from)?)\s*v?(\d+(?:\.\d+)+)/i.exec(r.body||'');
  var note=$('#dlNote');
  if(same){note.hidden=false;note.innerHTML='<strong>Heads-up:</strong> v'+esc(v)+' is the newest project release, but according to its release notes the Windows app is the same as v'+esc(same[1])+'. The installer below is not a newly rebuilt desktop app.'}
}

getReleases().then(function(d){
  if(!d.length)throw new Error('No releases were returned.');
  ALL=d;latestUI(d.filter(function(r){return !r.prerelease})[0]||d[0]);render(true);
}).catch(function(e){fail(e.message||'Network error')});

})();
