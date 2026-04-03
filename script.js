/* =============================
   STATE em memória + debounce save
============================= */
const STORAGE_KEY = "fichas_v4";
let STATE = loadState();
let saveTimer = null;

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if(!parsed || !Array.isArray(parsed.sheets)) return { sheets: [] };
    return parsed;
  }catch{
    return { sheets: [] };
  }
}
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
  }, 200);
}
function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/* =============================
   Modelo
============================= */
function makeEmptySheet(){
  return {
    id: uid(),
    nome: "",
    papel: "",
    vit: "0",
    mtc: "0",
    armorPB: { cabeca:0, torso:0, bracoD:0, bracoE:0, pernaD:0, pernaE:0 },
    track: Array(40).fill(false),
    mainImage: null,
    status: [
      { nome:"Int", valor:"", fixed:true },
      { nome:"Ref", valor:"", fixed:true },
      { nome:"Tech", valor:"", fixed:true },
      { nome:"auCon", valor:"", fixed:true },
      { nome:"Atr", valor:"", fixed:true },
      { nome:"sor", valor:"", fixed:true },
      { nome:"mov", valor:"", fixed:true },
      { nome:"tco", valor:"", fixed:true },
      { nome:"emp", valor:"", fixed:true },
      { nome:"correr", valor:"", fixed:true, readonly:true }, // mov*3
      { nome:"saltar", valor:"", fixed:true, readonly:true }  // correr/5
    ],
    equips: [],
    skills: []
  };
}

/* =============================
   Helpers
============================= */
function toNum(v){
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function fmt2(v){
  return (Math.round(v*100)/100).toString();
}
function downloadDataUrl(dataUrl, filename){
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function dataURLFromFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* =============================
   Export
============================= */
function sanitizeFilename(filename){
  // Remove/substitui caracteres inválidos no Windows: < > : " / \ | ? *
  return filename
    .replace(/[<>:"|?*/\\]/g, "")      // Remove caracteres inválidos
    .replace(/\s+/g, "_")               // Substitui espaços por underscore
    .trim()                             // Remove espaços nas pontas
    .slice(0, 200);                     // Limita a 200 caracteres
}

async function exportSheetAsJpeg(sheetEl, sheet){
  const hidden = sheetEl.querySelectorAll(".no-export");
  hidden.forEach(el => el.style.display = "none");
  const canvas = await html2canvas(sheetEl, { scale: 2, backgroundColor: "#ffffff" });
  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  hidden.forEach(el => el.style.display = "");
  const filename = sheet.nome ? `Ficha_${sanitizeFilename(sheet.nome)}` : `ficha_${sheet.id}`;
  downloadDataUrl(dataUrl, filename + ".jpg");
}
async function exportSheetAsPdf(sheetEl, sheet){
  const hidden = sheetEl.querySelectorAll(".no-export");
  hidden.forEach(el => el.style.display = "none");
  const canvas = await html2canvas(sheetEl, { scale: 2, backgroundColor: "#ffffff" });
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  hidden.forEach(el => el.style.display = "");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let remaining = imgH;
  let position = 0;
  while(remaining > 0){
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    remaining -= pageH;
    position -= pageH;
    if(remaining > 0) pdf.addPage();
  }
  const filename = sheet.nome ? `Ficha_${sanitizeFilename(sheet.nome)}` : `ficha_${sheet.id}`;
  pdf.save(filename + ".pdf");
}

/* =============================
   Damage global: marcar 0..idx / desmarcar idx..fim
============================= */
function applyGlobalDamage(arr, index, checked){
  if(checked){
    for(let i=0;i<=index;i++) arr[i]=true;
  }else{
    for(let i=index;i<arr.length;i++) arr[i]=false;
  }
}
function countDamage(arr){
  let c=0; for(const b of arr) if(b) c++;
  return c;
}

/* =============================
   Status calc: mov -> correr -> saltar + total (exceto correr/saltar)
============================= */
function recalcStatus(sheet){
  const list = sheet.status;
  const movIdx = list.findIndex(x => (x.nome||"").toLowerCase()==="mov");
  const correrIdx = list.findIndex(x => (x.nome||"").toLowerCase()==="correr");
  const saltarIdx = list.findIndex(x => (x.nome||"").toLowerCase()==="saltar");

  const mov = movIdx>=0 ? toNum(list[movIdx].valor) : 0;
  const correr = mov*3;
  const saltar = correr/5;

  if(correrIdx>=0) list[correrIdx].valor = fmt2(correr);
  if(saltarIdx>=0) list[saltarIdx].valor = fmt2(saltar);

  let total = 0;
  for(const it of list){
    const n = (it.nome||"").toLowerCase();
    if(n==="correr" || n==="saltar") continue;
    total += toNum(it.valor);
  }
  return total;
}

/* =============================
   Armor sum
============================= */
function armorSum(pb){
  return (pb?.cabeca||0)+(pb?.torso||0)+(pb?.bracoD||0)+(pb?.bracoE||0)+(pb?.pernaD||0)+(pb?.pernaE||0);
}

/* =============================
   Render
============================= */
const allFichasEl = document.getElementById("allFichas");

function renderAll(){
  allFichasEl.innerHTML = "";
  for(const sheet of STATE.sheets){
    allFichasEl.appendChild(renderSheet(sheet));
  }
}

function getSheetById(id){
  return STATE.sheets.find(s => s.id === id);
}

/* -----------------------------
   Render Sheet (sem re-render enquanto digita)
------------------------------*/
function renderSheet(sheet){
  // normaliza
  if(!sheet.armorPB) sheet.armorPB = { cabeca:0, torso:0, bracoD:0, bracoE:0, pernaD:0, pernaE:0 };
  if(!Array.isArray(sheet.track) || sheet.track.length!==40) sheet.track = Array(40).fill(false);

  const wrap = document.createElement("div");
  wrap.className = "sheet";
  wrap.dataset.sheetId = sheet.id;

  // sheet header
  const head = document.createElement("div");
  head.className = "sheet-head no-export";

  const left = document.createElement("div");
  left.className = "sheet-title";
  left.textContent = "FICHA";

  const btns = document.createElement("div");
  btns.className = "sheet-buttons";

  const pdfBtn = document.createElement("button");
  pdfBtn.className="btn";
  pdfBtn.type="button";
  pdfBtn.textContent="Exportar PDF";
  pdfBtn.addEventListener("click", () => exportSheetAsPdf(wrap, sheet));

  const jpgBtn = document.createElement("button");
  jpgBtn.className="btn";
  jpgBtn.type="button";
  jpgBtn.textContent="Exportar JPEG";
  jpgBtn.addEventListener("click", () => exportSheetAsJpeg(wrap, sheet));

  const delBtn = document.createElement("button");
  delBtn.className="btn";
  delBtn.type="button";
  delBtn.textContent="Excluir ficha";
  delBtn.addEventListener("click", () => {
    STATE.sheets = STATE.sheets.filter(s => s.id !== sheet.id);
    scheduleSave();
    renderAll();
  });

  btns.appendChild(pdfBtn);
  btns.appendChild(jpgBtn);
  btns.appendChild(delBtn);

  head.appendChild(left);
  head.appendChild(btns);

  // grid
  const grid = document.createElement("div");
  grid.className="grid";

  // image
  const bigImage = document.createElement("div");
  bigImage.className="big-image";

  // NOME (at top of image column)
  const nomeHeader = document.createElement("div");
  nomeHeader.className="section-header";
  nomeHeader.style.width="fit-content";
  nomeHeader.style.marginBottom="4px";
  nomeHeader.textContent="NOME";

  const nomeInput = document.createElement("input");
  nomeInput.className="text-field";
  nomeInput.value = sheet.nome || "";
  nomeInput.placeholder="Digite o nome...";
  nomeInput.style.marginBottom="6px";
  nomeInput.addEventListener("input", () => {
    sheet.nome = nomeInput.value;
    scheduleSave();
  });

  bigImage.appendChild(nomeHeader);
  bigImage.appendChild(nomeInput);

  // PAPEL (below nome)
  const papelHeader = document.createElement("div");
  papelHeader.className="section-header";
  papelHeader.style.width="fit-content";
  papelHeader.style.marginBottom="4px";
  papelHeader.textContent="PAPEL";

  const papelInput = document.createElement("input");
  papelInput.className="text-field";
  papelInput.value = sheet.papel || "";
  papelInput.placeholder="Digite...";
  papelInput.style.marginBottom="6px";
  papelInput.addEventListener("input", () => {
    sheet.papel = papelInput.value;
    scheduleSave();
  });

  bigImage.appendChild(papelHeader);
  bigImage.appendChild(papelInput);

  const drop = document.createElement("div");
  drop.className="image-drop";
  const dropX = document.createElement("span"); dropX.textContent="X";
  const dropImg = document.createElement("img");
  dropImg.alt="preview";
  drop.appendChild(dropX);
  drop.appendChild(dropImg);

  if(sheet.mainImage){
    dropImg.src = sheet.mainImage;
    dropImg.style.display="block";
    dropX.style.display="none";
  }

  drop.addEventListener("dragover", e=>{ e.preventDefault(); drop.style.opacity="0.85"; });
  drop.addEventListener("dragleave", ()=>{ drop.style.opacity="1"; });
  drop.addEventListener("drop", async e=>{
    e.preventDefault(); drop.style.opacity="1";
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if(!file) return;
    const dataUrl = await dataURLFromFile(file);
    sheet.mainImage = dataUrl;
    dropImg.src = dataUrl;
    dropImg.style.display="block";
    dropX.style.display="none";
    scheduleSave();
  });

  const imgActions = document.createElement("div");
  imgActions.className="image-actions no-export";

  const uploadLabel = document.createElement("label");
  uploadLabel.className="btn";
  uploadLabel.textContent="Enviar imagem";
  const uploadInput = document.createElement("input");
  uploadInput.type="file"; uploadInput.accept="image/*"; uploadInput.hidden=true;
  uploadLabel.appendChild(uploadInput);

  uploadInput.addEventListener("change", async ()=>{
    const file = uploadInput.files && uploadInput.files[0];
    if(!file) return;
    const dataUrl = await dataURLFromFile(file);
    sheet.mainImage = dataUrl;
    dropImg.src=dataUrl;
    dropImg.style.display="block";
    dropX.style.display="none";
    scheduleSave();
  });

  const clearMain = document.createElement("button");
  clearMain.className="btn";
  clearMain.type="button";
  clearMain.textContent="Remover";
  clearMain.addEventListener("click", ()=>{
    uploadInput.value="";
    sheet.mainImage=null;
    dropImg.removeAttribute("src");
    dropImg.style.display="none";
    dropX.style.display="block";
    scheduleSave();
  });

  const imgHint = document.createElement("div");
  imgHint.className="hint";
  imgHint.textContent="X = você pode pôr imagem";

  imgActions.appendChild(uploadLabel);
  imgActions.appendChild(clearMain);
  imgActions.appendChild(imgHint);

  bigImage.appendChild(drop);
  bigImage.appendChild(imgActions);

  // right column
  const right = document.createElement("div");

  // PERICIAS (moved to right column, below nome)
  const skillHeader = document.createElement("div");
  skillHeader.className="section-header";
  skillHeader.style.width="fit-content";
  skillHeader.style.marginTop="12px";
  skillHeader.textContent="PERÍCIAS";

  const skillRow = document.createElement("div");
  skillRow.className="row";

  const skillList = document.createElement("div");
  skillList.className="stack";
  skillList.dataset.list="skills";

  const addSkill = document.createElement("div");
  addSkill.className="plus no-export";
  addSkill.textContent="+";
  addSkill.addEventListener("click", ()=>{
    sheet.skills.push({ nome:"", valor:"" });
    scheduleSave();
    renderAll(); // estrutural
  });

  skillRow.appendChild(skillList);
  skillRow.appendChild(addSkill);

  right.appendChild(skillHeader);
  right.appendChild(skillRow);

  // VIT/MTC (moved to right column, below skills)
  const miniStats = document.createElement("div");
  miniStats.className="mini-stats";

  const vit = document.createElement("div"); vit.className="mini";
  vit.innerHTML = `<b>VIT</b>`;
  const vitVal = document.createElement("div");
  vitVal.className="val";
  vitVal.contentEditable="true";
  vitVal.spellcheck=false;
  vitVal.textContent = sheet.vit ?? "0";
  vitVal.addEventListener("input", ()=>{
    sheet.vit = vitVal.textContent.trim();
    scheduleSave();
  });
  vit.appendChild(vitVal);

  const mtc = document.createElement("div"); mtc.className="mini";
  mtc.innerHTML = `<b>MTC</b>`;
  const mtcVal = document.createElement("div");
  mtcVal.className="val";
  mtcVal.contentEditable="true";
  mtcVal.spellcheck=false;
  mtcVal.textContent = sheet.mtc ?? "0";
  mtcVal.addEventListener("input", ()=>{
    sheet.mtc = mtcVal.textContent.trim();
    scheduleSave();
  });
  mtc.appendChild(mtcVal);

  miniStats.appendChild(vit);
  miniStats.appendChild(mtc);

  right.appendChild(miniStats);

  // DAMAGE TRACK (moved to middle column, below vit/mtc)
  const track = renderTrack(sheet, wrap);
  right.appendChild(track);

  // ARMOR (moved to middle column)
  const armor = renderArmor(sheet, wrap);
  right.appendChild(armor);

  // Third column for STATUS + EQUIP
  const thirdColumn = document.createElement("div");

  // STATUS
  const statusHeader = document.createElement("div");
  statusHeader.className="section-header";
  statusHeader.textContent="STATUS";

  const statusRow = document.createElement("div");
  statusRow.className="row";

  const statusList = document.createElement("div");
  statusList.className="stack";
  statusList.dataset.list="status";

  const addStatus = document.createElement("div");
  addStatus.className="plus no-export";
  addStatus.textContent="+";
  addStatus.addEventListener("click", ()=>{
    sheet.status.push({ nome:"", valor:"", fixed:false });
    scheduleSave();
    renderAll(); // estrutural
  });

  statusRow.appendChild(statusList);
  statusRow.appendChild(addStatus);

  // EQUIP
  const equipHeader = document.createElement("div");
  equipHeader.className="section-header";
  equipHeader.textContent="EQUIPAMENTO";

  const equipRow = document.createElement("div");
  equipRow.className="row";

  const equipList = document.createElement("div");
  equipList.className="stack";
  equipList.dataset.list="equips";

  const addEquip = document.createElement("div");
  addEquip.className="plus no-export";
  addEquip.textContent="+";
  addEquip.addEventListener("click", ()=>{
    sheet.equips.push({ nome:"", descricao:"", image:null });
    scheduleSave();
    renderAll(); // estrutural
  });

  equipRow.appendChild(equipList);
  equipRow.appendChild(addEquip);

  thirdColumn.appendChild(statusHeader);
  thirdColumn.appendChild(statusRow);
  thirdColumn.appendChild(equipHeader);
  thirdColumn.appendChild(equipRow);

  // mount
  grid.appendChild(bigImage);
  grid.appendChild(right);
  grid.appendChild(thirdColumn);

  wrap.appendChild(head);
  wrap.appendChild(grid);

  // populate lists
  renderStatusList(sheet, statusList, wrap);
  renderEquipList(sheet, equipList, wrap);
  renderSkillsList(sheet, skillList, wrap);

  // update badges initially
  updateBadges(sheet, wrap);

  // Event delegation for damage clicks inside this sheet:
  wrap.addEventListener("change", (e) => {
    const cb = e.target;
    if(!(cb instanceof HTMLInputElement)) return;
    if(cb.classList.contains("box") && cb.dataset.absIndex){
      const abs = Number(cb.dataset.absIndex);
      const checked = cb.checked;
      applyGlobalDamage(sheet.track, abs, checked);

      // Update all checkboxes in THIS track without re-render:
      const boxes = wrap.querySelectorAll(`input.box[data-sheet="${sheet.id}"]`);
      boxes.forEach(b => {
        const i = Number(b.dataset.absIndex);
        b.checked = !!sheet.track[i];
      });

      scheduleSave();
      updateBadges(sheet, wrap);
    }
  });

  return wrap;
}

/* -----------------------------
   Badges
------------------------------*/
function updateBadges(sheet, sheetEl){
  const total = recalcStatus(sheet); // updates correr/saltar in state too
  // reflect correr/saltar and total in DOM if present
  const statusBox = sheetEl.querySelector('[data-list="status"]');
  if(statusBox){
    // update the existing correr/saltar inputs without full rebuild
    for(const card of statusBox.querySelectorAll(".card")){
      const name = card.querySelector('.text-field.grow')?.value?.toLowerCase?.() || "";
      const valInput = card.querySelector('.text-field.small');
      if(!valInput) continue;
      if(name === "correr"){
        valInput.value = sheet.status.find(s => s.nome.toLowerCase()==="correr")?.valor ?? "";
      }
      if(name === "saltar"){
        valInput.value = sheet.status.find(s => s.nome.toLowerCase()==="saltar")?.valor ?? "";
      }
    }
    const totalVal = statusBox.querySelector('input[data-total="1"]');
    if(totalVal) totalVal.value = fmt2(total);
  }

  const dmg = countDamage(sheet.track);
  const arm = armorSum(sheet.armorPB);

  const bTotal = sheetEl.querySelector('[data-badge="total"]');
  const bDmg = sheetEl.querySelector('[data-badge="dmg"]');
  const bArm = sheetEl.querySelector('[data-badge="arm"]');

  if(bTotal) bTotal.textContent = `TOTAL: ${fmt2(total)}`;
  if(bDmg) bDmg.textContent = `DANO: ${dmg}/40`;
  if(bArm) bArm.textContent = `PB: ${arm}`;
}

/* =============================
   Track renderer (data attrs p/ delegation)
============================= */
function renderTrack(sheet){
  const track = document.createElement("div");
  track.className="track";

  const groupsTop = ["LEVE","GRAVE","CRÍTICO","MORTAL-0","MORTAL-1"];
  const groupsBottom = ["MORTAL-2","MORTAL-3","MORTAL-4","MORTAL-5","MORTAL-6"];

  const grid1 = document.createElement("div");
  grid1.className="track-grid";

  let gIndex = 0;

  function makeGroup(title, groupIndex){
    const lvl = document.createElement("div");
    lvl.className="lvl";

    const t = document.createElement("div");
    t.className="lvl-title";
    t.textContent=title;

    const boxes = document.createElement("div");
    boxes.className="boxes";

    for(let i=0;i<4;i++){
      const abs = groupIndex*4+i;
      const cb = document.createElement("input");
      cb.type="checkbox";
      cb.className="box";
      cb.checked = !!sheet.track[abs];
      cb.dataset.absIndex = String(abs);
      cb.dataset.sheet = sheet.id; // helps find within sheet
      boxes.appendChild(cb);
    }

    lvl.appendChild(t);
    lvl.appendChild(boxes);
    return lvl;
  }

  for(let i=0;i<groupsTop.length;i++){
    grid1.appendChild(makeGroup(groupsTop[i], gIndex));
    gIndex++;
  }

  const atord1 = document.createElement("div");
  atord1.className="atord-row";
  for(let i=0;i<5;i++){
    const a=document.createElement("div");
    a.className="atord";
    a.textContent=`Atord-${i}`;
    atord1.appendChild(a);
  }

  const grid2 = document.createElement("div");
  grid2.className="track-grid second";

  for(let i=0;i<groupsBottom.length;i++){
    grid2.appendChild(makeGroup(groupsBottom[i], gIndex));
    gIndex++;
  }

  const atord2 = document.createElement("div");
  atord2.className="atord-row";
  for(let i=5;i<10;i++){
    const a=document.createElement("div");
    a.className="atord";
    a.textContent=`Atord-${i}`;
    atord2.appendChild(a);
  }

  track.appendChild(grid1);
  track.appendChild(atord1);
  track.appendChild(grid2);
  track.appendChild(atord2);

  return track;
}

/* =============================
   Armor renderer (updates badges live)
============================= */
function renderArmor(sheet, sheetEl){
  const wrap = document.createElement("div");
  wrap.className="armor";

  const table = document.createElement("table");

  const tr1 = document.createElement("tr");
  const thLoc = document.createElement("th");
  thLoc.className="loc";
  thLoc.textContent="Localização";
  tr1.appendChild(thLoc);

  const headers = [
    { key:"cabeca", label:"Cabeça" },
    { key:"torso",  label:"Torso" },
    { key:"bracoD", label:"Braço D." },
    { key:"bracoE", label:"Braço E" },
    { key:"pernaD", label:"Perna D." },
    { key:"pernaE", label:"Perna E." }
  ];
  headers.forEach(h=>{
    const th=document.createElement("th");
    th.textContent=h.label;
    tr1.appendChild(th);
  });
  table.appendChild(tr1);

  const tr2 = document.createElement("tr");
  const thBlank = document.createElement("th");
  thBlank.className="sub";
  thBlank.textContent="";
  tr2.appendChild(thBlank);
  ["1","2-4","5","6","7-8","9-0"].forEach(s=>{
    const th=document.createElement("th");
    th.className="sub";
    th.textContent=s;
    tr2.appendChild(th);
  });
  table.appendChild(tr2);

  const tr3 = document.createElement("tr");
  const tdPB = document.createElement("td");
  tdPB.className="pb";
  tdPB.textContent="Blindagem  PB";
  tr3.appendChild(tdPB);

  headers.forEach(h=>{
    const td=document.createElement("td");
    const inp=document.createElement("input");
    inp.type="number";
    inp.step="1";
    inp.value = String(sheet.armorPB?.[h.key] ?? 0);

    inp.addEventListener("input", ()=>{
      sheet.armorPB[h.key] = toNum(inp.value);
      scheduleSave();
      updateBadges(sheet, sheetEl);
    });

    td.appendChild(inp);
    tr3.appendChild(td);
  });

  table.appendChild(tr3);
  wrap.appendChild(table);
  return wrap;
}

/* =============================
   STATUS list (no rebuild on typing; rebuild only structural)
============================= */
function renderStatusList(sheet, container, sheetEl){
  container.innerHTML = "";

  // ensure auto fields are correct before initial render
  const total = recalcStatus(sheet);
  scheduleSave();

  sheet.status.forEach((item, i)=>{
    const nLower = (item.nome||"").toLowerCase();
    const isAuto = item.readonly || nLower==="correr" || nLower==="saltar";

    const card = document.createElement("div");
    card.className="card";

    if(!item.fixed){
      const rm = document.createElement("button");
      rm.className="remove no-export";
      rm.type="button";
      rm.textContent="–";
      rm.addEventListener("click", ()=>{
        sheet.status.splice(i,1);
        scheduleSave();
        renderAll();
      });
      card.appendChild(rm);
    }

    const line = document.createElement("div");
    line.className="two-col";

    const nome = document.createElement("input");
    nome.className="text-field grow";
    nome.value=item.nome;
    nome.placeholder="Nome...";
    if(item.fixed){ nome.readOnly=true; nome.style.opacity="0.9"; }
    nome.addEventListener("input", ()=>{
      item.nome = nome.value;
      scheduleSave();
      updateBadges(sheet, sheetEl);
    });

    const val = document.createElement("input");
    val.className="text-field small";
    val.value=item.valor;
    val.placeholder="0";
    if(isAuto){
      val.readOnly=true;
      val.classList.add("auto");
      val.style.opacity="0.95";
    }
    val.addEventListener("input", ()=>{
      item.valor = val.value;
      // updates correr/saltar/total in place
      updateBadges(sheet, sheetEl);
      scheduleSave();
    });

    line.appendChild(nome);
    line.appendChild(val);
    card.appendChild(line);
    container.appendChild(card);
  });

  // TOTAL card
  const totalCard = document.createElement("div");
  totalCard.className="card";

  const totalLine = document.createElement("div");
  totalLine.className="two-col";

  const totalName = document.createElement("input");
  totalName.className="text-field grow auto";
  totalName.readOnly=true;
  totalName.value="TOTAL";
  totalName.style.fontWeight="1000";

  const totalVal = document.createElement("input");
  totalVal.className="text-field small auto";
  totalVal.readOnly=true;
  totalVal.value=fmt2(total);
  totalVal.style.fontWeight="1000";
  totalVal.dataset.total="1";

  totalLine.appendChild(totalName);
  totalLine.appendChild(totalVal);
  totalCard.appendChild(totalLine);
  container.appendChild(totalCard);
}

/* =============================
   Skills
============================= */
function renderSkillsList(sheet, container, sheetEl){
  container.innerHTML = "";
  sheet.skills.forEach((sk, i)=>{
    const card=document.createElement("div");
    card.className="card";

    const rm=document.createElement("button");
    rm.className="remove no-export";
    rm.type="button";
    rm.textContent="–";
    rm.addEventListener("click", ()=>{
      sheet.skills.splice(i,1);
      scheduleSave();
      renderAll();
    });

    const line=document.createElement("div");
    line.className="two-col";

    const nome=document.createElement("input");
    nome.className="text-field grow";
    nome.value=sk.nome ?? "";
    nome.placeholder="Perícia...";
    nome.addEventListener("input", ()=>{
      sk.nome = nome.value;
      scheduleSave();
    });

    const val=document.createElement("input");
    val.className="text-field small";
    val.value=sk.valor ?? "";
    val.placeholder="0";
    val.addEventListener("input", ()=>{
      sk.valor = val.value;
      scheduleSave();
    });

    card.appendChild(rm);
    line.appendChild(nome);
    line.appendChild(val);
    card.appendChild(line);
    container.appendChild(card);
  });
}

/* =============================
   Equip
============================= */
function renderEquipList(sheet, container, sheetEl){
  container.innerHTML="";
  sheet.equips.forEach((eq, i)=>{
    const card=document.createElement("div");
    card.className="card tall";
    card.dataset.equipIndex=i;
    
    // Initialize collapsed state (default: collapsed)
    eq.collapsed = eq.collapsed !== false ? true : false;

    const rm=document.createElement("button");
    rm.className="remove no-export";
    rm.type="button";
    rm.textContent="–";
    rm.addEventListener("click", ()=>{
      sheet.equips.splice(i,1);
      scheduleSave();
      renderAll();
    });
    card.appendChild(rm);

    // Card Header (nome com toggle)
    const header=document.createElement("div");
    header.className="card-header no-export";
    header.style.marginBottom="8px";
    
    const toggle=document.createElement("div");
    toggle.className="card-toggle";
    toggle.textContent = eq.collapsed ? "+" : "−";
    
    const nomeName=document.createElement("input");
    nomeName.className="text-field";
    nomeName.value=eq.nome ?? "";
    nomeName.placeholder="Nome do equipamento...";
    nomeName.style.flex="1";
    nomeName.style.marginBottom="0";
    nomeName.addEventListener("input", ()=>{
      eq.nome = nomeName.value;
      scheduleSave();
    });
    nomeName.addEventListener("click", (e)=>{
      e.stopPropagation();
    });
    
    const descPreview=document.createElement("div");
    descPreview.style.flex="1";
    descPreview.style.fontSize="14px";
    descPreview.style.color="var(--muted)";
    descPreview.style.overflow="hidden";
    descPreview.style.textOverflow="ellipsis";
    descPreview.style.whiteSpace="nowrap";
    descPreview.style.marginLeft="8px";
    
    const updateDescPreview = () => {
      if(eq.collapsed && eq.descricao){
        descPreview.textContent = eq.descricao;
        descPreview.style.display = "block";
      } else {
        descPreview.style.display = "none";
      }
    };
    
    header.appendChild(toggle);
    header.appendChild(nomeName);
    header.appendChild(descPreview);
    
    header.addEventListener("click", ()=>{
      eq.collapsed = !eq.collapsed;
      toggle.textContent = eq.collapsed ? "+" : "−";
      content.classList.toggle("hidden");
      updateDescPreview();
      scheduleSave();
    });

    // Card Content (expandível)
    const content=document.createElement("div");
    content.className="card-content no-export";
    if(eq.collapsed) content.classList.add("hidden");

    const xBox=document.createElement("div");
    xBox.className="x-box";
    const x=document.createElement("div");
    x.className="x";
    x.textContent="X";
    const img=document.createElement("img");
    img.alt="equip preview";
    xBox.appendChild(x);
    xBox.appendChild(img);

    if(eq.image){
      img.src=eq.image;
      img.style.display="block";
      x.style.display="none";
      
      // Ajusta altura ao carregar imagem existente
      img.onload = () => {
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        const width = xBox.offsetWidth;
        const calculatedHeight = width / aspectRatio;
        xBox.style.height = Math.min(calculatedHeight, 300) + "px";
      };
    }

    const actions=document.createElement("div");
    actions.className="no-export";
    actions.style.display="flex";
    actions.style.gap="8px";
    actions.style.marginBottom="8px";
    actions.style.flexWrap="wrap";

    const uploadLabel=document.createElement("label");
    uploadLabel.className="btn";
    uploadLabel.style.padding="6px 8px";
    uploadLabel.style.fontSize="12px";
    uploadLabel.textContent="Imagem";
    const fileInput=document.createElement("input");
    fileInput.type="file";
    fileInput.accept="image/*";
    fileInput.hidden=true;
    uploadLabel.appendChild(fileInput);

    fileInput.addEventListener("change", async ()=>{
      const file = fileInput.files && fileInput.files[0];
      if(!file) return;
      const dataUrl = await dataURLFromFile(file);
      eq.image = dataUrl;
      img.src=dataUrl;
      img.style.display="block";
      x.style.display="none";
      
      // Ajusta altura do container ao carregar imagem
      img.onload = () => {
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        const width = xBox.offsetWidth;
        const calculatedHeight = width / aspectRatio;
        xBox.style.height = Math.min(calculatedHeight, 300) + "px";
      };
      
      scheduleSave();
    });

    const clearBtn=document.createElement("button");
    clearBtn.className="btn";
    clearBtn.type="button";
    clearBtn.style.padding="6px 8px";
    clearBtn.style.fontSize="12px";
    clearBtn.textContent="Limpar";
    clearBtn.addEventListener("click", ()=>{
      fileInput.value="";
      eq.image=null;
      img.removeAttribute("src");
      img.style.display="none";
      x.style.display="block";
      xBox.style.height="90px";
      scheduleSave();
    });

    actions.appendChild(uploadLabel);
    actions.appendChild(clearBtn);

    const desc=document.createElement("textarea");
    desc.className="text-field";
    desc.value=eq.descricao ?? "";
    desc.placeholder="Descrição...";
    desc.addEventListener("input", ()=>{
      eq.descricao = desc.value;
      updateDescPreview();
      scheduleSave();
    });

    content.appendChild(xBox);
    content.appendChild(actions);
    content.appendChild(desc);

    card.appendChild(header);
    card.appendChild(content);
    
    // Atualiza preview inicial
    updateDescPreview();

    container.appendChild(card);
  });
}

/* =============================
   Boot + Global controls
============================= */
document.getElementById("addSheet").addEventListener("click", ()=>{
  STATE.sheets.push(makeEmptySheet());
  scheduleSave();
  renderAll();
});

document.getElementById("clearAll").addEventListener("click", ()=>{
  localStorage.removeItem(STORAGE_KEY);
  STATE = { sheets: [] };
  STATE.sheets.push(makeEmptySheet());
  scheduleSave();
  renderAll();
});

(function init(){
  if(STATE.sheets.length === 0) STATE.sheets.push(makeEmptySheet());
  renderAll();
})();