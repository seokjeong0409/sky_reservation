// =====================================================================
// 여기에 Firebase 콘솔에서 복사한 firebaseConfig 값을 그대로 붙여넣으세요.
// (프로젝트 설정 > 일반 > 내 앱 > SDK 설정 및 구성 에서 확인 가능)
// =====================================================================
const firebaseConfig = {
  apiKey: "AIzaSyC8EHcFgAnJM7GV9KiBjiDp7W5hQXnKvl0",
  authDomain: "sky-reservation-72234.firebaseapp.com",
  databaseURL: "https://sky-reservation-72234-default-rtdb.firebaseio.com", // Realtime Database URL, 반드시 필요
  projectId: "sky-reservation-72234",
  storageBucket: "sky-reservation-72234.firebasestorage.app",
  messagingSenderId: "752860468841",
  appId: "1:752860468841:web:0dc55af0c05026daf934f8"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let driverDayOffset = 0;

function pad(n){return String(n).padStart(2,'0');}
function fmtDate(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function dowKR(d){return ['일','월','화','수','목','금','토'][d.getDay()];}
function todayDate(){return new Date();}
function addDays(base,n){const d=new Date(base);d.setDate(d.getDate()+n);return d;}
function toMinutes(hhmm){const [h,m]=hhmm.split(':').map(Number);return h*60+m;}
function overlaps(aStart,aEnd,bStart,bEnd){return toMinutes(aStart)<toMinutes(bEnd) && toMinutes(bStart)<toMinutes(aEnd);}
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---- Firebase 데이터 접근 ----
async function getReservations(dateStr){
  const snap = await db.ref('reservations/' + dateStr).once('value');
  const val = snap.val();
  if(!val) return [];
  return Object.keys(val).map(id => ({ id, ...val[id] }));
}
async function addReservation(dateStr, item){
  const ref = db.ref('reservations/' + dateStr).push();
  await ref.set(item);
  return ref.key;
}
async function removeReservation(dateStr, id){
  await db.ref('reservations/' + dateStr + '/' + id).remove();
}
async function getMonthReservations(year, month){
  const mm = pad(month);
  const start = `${year}-${mm}-01`;
  const end = `${year}-${mm}-31`;
  const snap = await db.ref('reservations').orderByKey().startAt(start).endAt(end).once('value');
  return snap.val() || {};
}

// ---- 탭 전환 ----
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('main > section').forEach(s=>s.classList.add('hidden'));
    document.getElementById('tab-'+btn.dataset.tab).classList.remove('hidden');
    if(btn.dataset.tab==='board') renderBoard();
    if(btn.dataset.tab==='driver') renderDriver();
    if(btn.dataset.tab==='calendar') renderCalendarGrid();
  });
});

// ---- 시계 ----
function tickClock(){
  const d=new Date();
  document.getElementById('clock').textContent = `${fmtDate(d)} (${dowKR(d)}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
tickClock(); setInterval(tickClock,30000);

// ---- 신청 폼 ----
const dateInput = document.getElementById('f-date');
dateInput.value = fmtDate(todayDate());
dateInput.addEventListener('change', renderPreview);
document.getElementById('submitBtn').addEventListener('click', submitReservation);
renderPreview();

async function renderPreview(){
  const dateStr = dateInput.value;
  const label = document.getElementById('previewLabel');
  const list = document.getElementById('previewList');
  if(!dateStr){ label.textContent='날짜를 선택하면 해당일 예약 현황이 표시됩니다'; list.innerHTML=''; return; }
  const d = new Date(dateStr+'T00:00:00');
  const isToday = fmtDate(d)===fmtDate(todayDate());
  label.textContent = `${dateStr} (${dowKR(d)}) 예약 현황`;
  list.innerHTML = '<div class="empty-note">불러오는 중...</div>';
  const items = await getReservations(dateStr);
  items.sort((a,b)=>toMinutes(a.start)-toMinutes(b.start));
  if(items.length===0){
    list.innerHTML = '<div class="empty-note">이 날짜에는 아직 예약이 없습니다.</div>';
    return;
  }
  list.innerHTML = items.map(it=>`
    <div class="ticket ${isToday?'today':''}">
      <div class="ticket-time">${it.start} - ${it.end}</div>
      <div class="ticket-who">${escapeHtml(it.name)} · ${escapeHtml(it.dept)}</div>
      <div class="ticket-what">${escapeHtml(it.location)}</div>
    </div>
  `).join('');
}

function showMsg(text, type){
  const el = document.getElementById('formMsg');
  el.innerHTML = `<div class="msg ${type}">${text}</div>`;
}

async function submitReservation(){
  const name = document.getElementById('f-name').value.trim();
  const dept = document.getElementById('f-dept').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const date = document.getElementById('f-date').value;
  const start = document.getElementById('f-start').value;
  const end = document.getElementById('f-end').value;
  const loc = document.getElementById('f-loc').value.trim();
  const work = document.getElementById('f-work').value.trim();

  if(!name||!dept||!phone||!date||!start||!end||!loc||!work){
    showMsg('모든 항목을 입력해 주세요.', 'err'); return;
  }
  if(toMinutes(start) >= toMinutes(end)){
    showMsg('종료 시간은 시작 시간보다 늦어야 합니다.', 'err'); return;
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = '확인 중...';

  try{
    const existing = await getReservations(date);
    const conflict = existing.find(it => overlaps(start,end,it.start,it.end));
    if(conflict){
      showMsg(`이미 ${conflict.start}-${conflict.end}에 ${escapeHtml(conflict.name)}(${escapeHtml(conflict.dept)})님이 예약되어 있어 신청이 불가합니다. 다른 시간을 선택해 주세요.`, 'err');
      btn.disabled = false; btn.textContent = '예약 신청하기';
      return;
    }
    await addReservation(date, {
      name, dept, phone, start, end, location: loc, work,
      createdAt: new Date().toISOString()
    });
    showMsg(`예약이 완료되었습니다. (${date} ${start}-${end})`, 'ok');
    document.getElementById('f-loc').value='';
    document.getElementById('f-work').value='';
    renderPreview();
  }catch(e){
    console.error(e);
    showMsg('저장 중 오류가 발생했습니다. Firebase 설정값을 확인해 주세요.', 'err');
  }
  btn.disabled = false; btn.textContent = '예약 신청하기';
}

// ---- 현황판 ----
async function renderBoard(){
  const container = document.getElementById('boardList');
  container.innerHTML = '<div class="empty-note">불러오는 중...</div>';
  const today = todayDate();
  let html = '';
  for(let i=0;i<14;i++){
    const d = addDays(today, i);
    const dateStr = fmtDate(d);
    const items = await getReservations(dateStr);
    items.sort((a,b)=>toMinutes(a.start)-toMinutes(b.start));
    html += `<div class="day-block">
      <div class="day-head">
        <span class="d-date">${dateStr}</span>
        <span class="d-dow">${dowKR(d)}요일</span>
        ${i===0?'<span class="d-today-flag">오늘</span>':''}
      </div>`;
    if(items.length===0){
      html += `<div class="empty-note">예약 없음</div>`;
    }else{
      html += items.map(it=>`
        <div class="board-row">
          <div class="rt">${it.start}<br>${it.end}</div>
          <div class="rmid">
            <div class="rname">${escapeHtml(it.name)} · ${escapeHtml(it.dept)}</div>
            <div class="rmeta">${escapeHtml(it.location)} · 연락처 ${escapeHtml(it.phone)}</div>
            <div class="rwork">${escapeHtml(it.work)}</div>
          </div>
          <button class="cancel-btn" data-date="${dateStr}" data-id="${it.id}">취소</button>
        </div>
      `).join('');
    }
    html += `</div>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('.cancel-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>cancelReservation(btn.dataset.date, btn.dataset.id));
  });
}

async function cancelReservation(dateStr, id){
  if(!confirm('이 예약을 취소하시겠습니까?')) return;
  await removeReservation(dateStr, id);
  renderBoard();
}

// ---- 기사님 화면 ----
document.getElementById('btnToday').addEventListener('click', ()=>setDriverDay(0));
document.getElementById('btnTomorrow').addEventListener('click', ()=>setDriverDay(1));

function setDriverDay(offset){
  driverDayOffset = offset;
  document.getElementById('btnToday').classList.toggle('active', offset===0);
  document.getElementById('btnTomorrow').classList.toggle('active', offset===1);
  renderDriver();
}

// ---- 월간 캘린더 ----
let calYear = todayDate().getFullYear();
let calMonth = todayDate().getMonth() + 1; // 1-12

document.getElementById('calPrev').addEventListener('click', ()=>{
  calMonth--; if(calMonth<1){calMonth=12; calYear--;}
  document.getElementById('calDayDetail').innerHTML='';
  renderCalendarGrid();
});
document.getElementById('calNext').addEventListener('click', ()=>{
  calMonth++; if(calMonth>12){calMonth=1; calYear++;}
  document.getElementById('calDayDetail').innerHTML='';
  renderCalendarGrid();
});

function daysInMonth(y,m){ return new Date(y, m, 0).getDate(); }
function firstWeekday(y,m){ return new Date(y, m-1, 1).getDay(); }

async function renderCalendarGrid(){
  document.getElementById('calMonthLabel').textContent = `${calYear}년 ${calMonth}월`;
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '<div class="empty-note">불러오는 중...</div>';
  const monthData = await getMonthReservations(calYear, calMonth);
  const numDays = daysInMonth(calYear, calMonth);
  const startWeekday = firstWeekday(calYear, calMonth);
  const todayStr = fmtDate(todayDate());

  let cells = '';
  for(let i=0;i<startWeekday;i++){ cells += `<div class="cal-cell empty"></div>`; }
  for(let d=1; d<=numDays; d++){
    const dateStr = `${calYear}-${pad(calMonth)}-${pad(d)}`;
    const dayItems = monthData[dateStr] ? Object.values(monthData[dateStr]) : [];
    const count = dayItems.length;
    const isToday = dateStr === todayStr;
    cells += `<div class="cal-cell ${isToday?'today':''} ${count>0?'has-res':''}" data-date="${dateStr}">
      <div class="cal-daynum">${d}</div>
      ${count>0 ? `<div class="cal-badge">${count}건</div>` : ''}
    </div>`;
  }

  grid.innerHTML = `
    <div class="cal-weekdays">${['일','월','화','수','목','금','토'].map(w=>`<div>${w}</div>`).join('')}</div>
    <div class="cal-days">${cells}</div>
  `;
  grid.querySelectorAll('.cal-cell[data-date]').forEach(cell=>{
    cell.addEventListener('click', ()=> selectCalendarDate(cell.dataset.date));
  });
}

async function selectCalendarDate(dateStr){
  document.querySelectorAll('.cal-cell').forEach(c=>c.classList.remove('selected'));
  const cell = document.querySelector(`.cal-cell[data-date="${dateStr}"]`);
  if(cell) cell.classList.add('selected');

  const panel = document.getElementById('calDayDetail');
  const d = new Date(dateStr+'T00:00:00');
  const headerHtml = `<div class="preview-date-label">${dateStr} (${dowKR(d)}요일) 예약 목록</div>`;
  panel.innerHTML = headerHtml + '<div class="empty-note">불러오는 중...</div>';

  const items = await getReservations(dateStr);
  items.sort((a,b)=>toMinutes(a.start)-toMinutes(b.start));

  if(items.length===0){
    panel.innerHTML = headerHtml + '<div class="empty-note">이 날짜에는 예약이 없습니다.</div>';
    return;
  }
  // 기사님 화면과 동일한 큰 카드로 표시 (요청: 날짜 클릭 시 크게 보기)
  panel.innerHTML = headerHtml + items.map(it=>`
    <div class="driver-card">
      <div class="driver-time">${it.start} - ${it.end}</div>
      <div class="driver-loc">${escapeHtml(it.location)}</div>
      <div class="driver-work">${escapeHtml(it.work)}</div>
      <div class="driver-req">신청자: ${escapeHtml(it.name)} (${escapeHtml(it.dept)}) · 연락처 ${escapeHtml(it.phone)}</div>
    </div>
  `).join('');
}

async function renderDriver(){
  const d = addDays(todayDate(), driverDayOffset);
  const dateStr = fmtDate(d);
  document.getElementById('driverDate').textContent = `${dateStr} (${dowKR(d)}요일)`;
  const listEl = document.getElementById('driverList');
  const countEl = document.getElementById('driverCount');
  countEl.textContent = '불러오는 중...';
  listEl.innerHTML = '';
  const items = await getReservations(dateStr);
  items.sort((a,b)=>toMinutes(a.start)-toMinutes(b.start));
  countEl.textContent = items.length===0 ? '예정된 작업이 없습니다' : `총 ${items.length}건의 작업이 예정되어 있습니다`;
  if(items.length===0){
    listEl.innerHTML = '<div class="driver-empty">오늘은 등록된 작업이 없습니다.</div>';
    return;
  }
  listEl.innerHTML = items.map(it=>`
    <div class="driver-card">
      <div class="driver-time">${it.start} - ${it.end}</div>
      <div class="driver-loc">${escapeHtml(it.location)}</div>
      <div class="driver-work">${escapeHtml(it.work)}</div>
      <div class="driver-req">신청자: ${escapeHtml(it.name)} (${escapeHtml(it.dept)}) · 연락처 ${escapeHtml(it.phone)}</div>
    </div>
  `).join('');
}
