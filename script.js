/* =============================
  DATA PERSISTENCE (LocalStorage Logic)
============================= */
/** @constant {string} - The key used to identify the data in LocalStorage */
const CHARACTER_SHEETS_STORAGE_KEY = "cyberpunk_sheets_v4";

/** @type {object} - In-memory state of all character sheets */
let appState = loadApplicationState();

/** @type {number|null} - Timer reference for the debounce saving function */
let saveDebounceTimer = null;

/**
 * Retrieves the stored data from LocalStorage and parses it.
 * @returns {object} The parsed state or a default empty sheets structure
 */
function loadApplicationState(){
  try {
    const rawData = localStorage.getItem(CHARACTER_SHEETS_STORAGE_KEY);
    const parsedData = rawData ? JSON.parse(rawData) : null;

    // Validation: ensures parsedData exists and has a 'sheets' array
    if (!parsedData || !Array.isArray(parsedData.sheets)) {
      return { sheets: [] };
    } 
    return parsedData;
  } catch (error) {
    console.error("Error loading state from LocalStorage:", error);
    return { sheets: [] };
  }
}

/**
 * Schedules a save operation to LocalStorage using a debounce technique
 * to avoid excessive writes during rapid input changes
 */
function scheduleStateSave(){
  clearTimeout(saveDebounceTimer);

  // Saves after 200ms of inactivity
  saveDebounceTimer = setTimeout(() => {
    localStorage.setItem(CHARACTER_SHEETS_STORAGE_KEY, JSON.stringify(appState));
    console.log("State auto-saved to LocalStorage.")
  }, 200);
}

/**
 * Generates a unique identifier for each character sheet.
 * Combines a random string with the current timestamp to avoid collisions
 * @returns {string} A unique hex string
 */
function generateUniqueId(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/* =============================
  CHARACTER MODEL (Template)
============================= */
/**
 * Creates a new, empty Cyberpunk 2020 character sheet object.
 * @returns {object} The initial state for a new character
 */
function createEmptySheet(){
  return {
    id: generateUniqueId(),
    name: "",
    role: "",
    vitality: "0",
    btm: "0",
    armorSP: { // Stopping Power
      head:0, 
      torso:0, 
      rightArm:0, 
      leftArm:0, 
      RightLeg:0, 
      leftLeg:0 },
    damageTrack: Array(40).fill(false),
    mainImage: null,
    stats: [
      { name:"INT", value:"", isFixed:true },
      { name:"REF", value:"", isFixed:true },
      { name:"TECH", value:"", isFixed:true },
      { name:"COOL", value:"", isFixed:true },
      { name:"ATTR", value:"", isFixed:true },
      { name:"LUCK", value:"", isFixed:true },
      { name:"MA", value:"", isFixed:true }, // Movement Allowance
      { name:"BODY", value:"", isFixed:true },
      { name:"EMP", value:"", isFixed:true },
      // Derived stats (Calculated)
      { name:"RUN", value:"", isFixed:true, isReadonly:true }, // MA * 3
      { name:"LEAP", value:"", isFixed:true, isReadonly:true }  // RUN / 4
    ],
    equipment: [],
    skills: []
  };
}

/* =============================
   STATS CALCULATION
============================= */
/**
 * Constans for Cyberpunk 2020 movement rules.
 * Extracting these makes the code easier to maintain and read
 */
const RUN_MULTIPLIER = 3;
const LEAP_DIVISOR = 4;
/**
 * Reacalculates movement-based stats (Run/Leap) and returns the sum of base attributes.
 * Also updates the sheet's stats array with the calculated values
 * @param {object} sheet - The character sheet object containing  the stats array
 * @returns {number} The sum of all base attributes (excluding derived movement stats)
 */

function updateMovementAndTotalStats(sheet){
  const stats = sheet.stats;

  // 1. Search objects directly
  const maStat = findStat(stats, "MA");
  const runStat = findStat(stats, "RUN")
  const leapStat = findStat(stats, "LEAP");

  // 2. Calculate Run and Leap based on Movement Allowance (MA)
  // parseToSafeNumber() converts strings//nulls to a safe number
  const movementAllowance = maStat ? parseToSafeNumber(maStat.value) : 0;

  const runValue = movementAllowance * RUN_MULTIPLIER;
  const leapValue = runValue / LEAP_DIVISOR;

  // 3. Update the sheet values using the formatting helper (fmt2)
  if (runStat) runStat.value = formatToTwoDecimals(runValue);
  if (leapStat) leapStat.value = formatToTwoDecimals(leapValue);

  // 4. Calculate the Total Point Sum
  // This is useful for character creation (e.g., checking if the player spent 60 points)
  return stats.reduce((total, stat) => {
    const name = (stat.name || "").toLowerCase();
    if (name === "run" || name === "leap") return total;
    return total + parseToSafeNumber(stat.value);
  }, 0);
}

/* =============================
  Armor sum
============================= */
/**
 * Sums the Stopping Power (SP) of all body parts
 * @param {object} armorSP - Object containing SP values for each body part.
 * @returns {number} The total sum of armor protection
 */
function armorSum(armorSP){
  // 1. Safety check: if armorSP is null or undefined, return 0
  if (!armorSP) return 0;

  // 2. Destructuring the object for cleaner access
  // This allows us to use 'head' instead of 'armorSP.head'
  const {
    head = 0,
    torso = 0,
    rightArm = 0,
    leftArm = 0,
    rightLeg = 0,
    leftLeg = 0
  } = armorSP;

  // 3. Return the sum
  return head + torso + rightArm + leftArm + rightLeg + leftLeg;
}

/* =============================
  WOUND MANAGEMENT (Damage Trackging)
============================= */

/**
 * Updates the wound track based on the clicked square.
 * If checking: fills all squares from the start up to the index.
 * If unchecking: clears all squares from the index to the end.
 * @param {boolean[]} damageArray - The array of 40 booleans representing wounds.
 * @param {number} selectedIndex - The index of the square that was clicked
 * @param {boolean} isChecked - The new state of the clicked square
 */
function updateWoundTrack(damageArray, selectedIndex, isChecked){
  if(isChecked){
    // Fill everything from 0 to the clicked index
    damageArray.fill(true, 0, selectedIndex + 1);
  } else {
    // Clear everything from the clicked index to the very end
    damageArray.fill(false, selectedIndex, damageArray.length);
  }
}

/**
 * Counts how many damage squares are currently marked as true
 * @param {boolean[]} damageArray - The array of wounds 
 * @returns {number} The total amount of damage taken.
 */
function getTotalDamageCount(damageArray) {
  // Using filter().length is a clean, modern way to count specific values
  return damageArray.filter(isMarked => isMarked === true).length;
}

/* =============================
  UTILITY HELPERS (Math & Formatting)
============================= */
/**
 * Safely finds a stat object by its name, ignoring case.
 * @param {Array} list - The stats array
 * @param {string} name - The name to search for.
 * @returns {object|null} The stat object or null if not found.
 */
function findStat (list, name) {
  if (!Array.isArray(list)) return null;

  return list.find(s => (s.name || "").toLowerCase() === name.toLowerCase()) || null;
}

/**
 * Converts any value to a safe number.
 * Handles comma-to-dot replacement and null/undefined values
 * @param {any} value - The input to be converted
 * @returns {number} The converted number or 0 if invalid
 */
function parseToSafeNumber(value) {
  // 1. Convert to string and handle null/undefined using Nullish Coalescing (??)
  // 2. Replace comma with dot to support different decimal formats (e.g., 1,5 -> 1.5)
  const sanitizedValue = String(value ?? "").replace(",", ".");

  const parsedNumber = Number(sanitizedValue);

  // 3. Check if it's a real number (not NaN or Infinity)
  return Number.isFinite(parsedNumber) ? parsedNumber : 0;
}

/**
 * Rounds a number to a maximum of 2 decimal places and returns it as a string.
 * @param {number} value - The number to format.
 * @returns {string} The formatted number.
 */
function formatToTwoDecimals(value) {
  // Standard rounding logic: (value * 100) / 100
  // Example: 1.555 * 100 = 155.5 -> round = 156 -> /100 = 1.56
  return (Math.round(value * 100) / 100).toString();
}

/* =============================
  Export
============================= */
/**
 * Sanitizes a string to be used as a safe filename across different OS.
 * Removes invalid characters, replaces spaces with underscores, and limits length
 * @param {string} fileName - The original filename (e.g., Character Name).
 * @returns {string} The sanitized, filesystem-friendly filename
 */
function formatSafeFileName(fileName){
  // 1. Safety check: Ensure we are working with a string
  const input = String(fileName ?? "character_sheet");
  return input
  // 2. Remove characters that are illegal in Windows/Linux/MacOS: < > : " / \ | ? *
  // The 'g' flag means "global" (replace all occurrences)
  .replace(/[<>:"|?*/\\]/g, "")

  //3. Replace one or more spaces (white space) with a single underscore
  // \s+ matches one or more space characters
  .replace(/\s+/g, "_")

  // 4. Remove leading and trailing spaces or underscores
  .trim()

  // 5. Limit the length to 200 characters to prevent filesystem errors
  .slice(0, 200);
}

/**
 * Triggers a browser download for a given data URL.
 * Creates a hidden anchor element, simulates a click, and removes it.
 * @param {string} dataUrl - The base64 or object URL of the file.
 * @param {string} fileName - The default name for the downloaded file.
 */
function triggerFileDownload(dataUrl, fileName){
  // 1. Create a virtual 'anchor' (<a>) element in memory
  const downloadLink = document.createElement('a');

  // 2. Set the source and the target filename
  downloadLink.href = dataUrl;
  downloadLink.download = fileName;

  // 3. Temporarily add to the document to make it "clickable" in some browsers
  document.body.appendChild(downloadLink);

  // 4. Programmatically trigger the click event
  downloadLink.click();

  // 5. Clean up by removing the element from the DOM immediately
  downloadLink.remove();
}

/**
 * Captures a specific HTML element and exports it as a JPEG image.
 * Temporarily hides elements marked with '.no-export' during capture
 * @param {HTMLElement} sheetElement - The DOM element to be captured (the sheet)
 * @param {object} characterData - The character object to retrieve name/id. 
 */
async function exportCharacterSheetAsJpeg(sheetElement, characterData) {
  // 1. Identify and hide elements that shouldn't apper in the photo (e.g., buttons)
  const elementsToHide = sheetElement.querySelectorAll(".no-export");
  elementsToHide.forEach(el => el.style.display = "none");

  try {
    // 2. Generate the Canvas using html2canvas library
    // scale: 2 improves image quality (DPI)
    const canvas = await html2canvas(sheetElement, { 
      scale: 2, 
      backgroundColor: "#ffffff",
      useCORS: true // Useful if loading external images
    });

    // 3. Convert the Canvas to a JPEG Data URL (95% quality)
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.95);

    // 4. Restore visibility of the hidden elements
    elementsToHide.forEach(el => el.style.display = "");

    // 5. Generate a safe filename
    const baseName = characterData.name 
    ? `Cyberpunk_Sheet_${formatSafeFileName(characterData.name)}` 
    : `Cyberpunk_Sheet_${characterData.id}`;

    // 6. Trigger the actual download
    triggerFileDownload(imageDataUrl, `${baseName}.jpg`);
  } catch (error) {
    console.error("Failed to export sheet as JPEG:", error);
    // Ensure UI elements ares= restored eve if an error occurs
    elementsToHide.forEach(el => el.style.display = "");
  }
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
  const filename = sheet.name ? `Ficha_${formatSafeFileName(sheet.name)}` : `ficha_${sheet.id}`;
  pdf.save(filename + ".pdf");
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
   Render
============================= */
const allFichasEl = document.getElementById("allFichas");

function renderAll(){
  allFichasEl.innerHTML = "";
  for(const sheet of appState.sheets){
    allFichasEl.appendChild(renderSheet(sheet));
  }
}

function getSheetById(id){
  return appState.sheets.find(s => s.id === id);
}

/* -----------------------------
   Render Sheet (sem re-render enquanto digita)
------------------------------*/
function renderSheet(sheet){
  // normaliza
  if(!sheet.armorSP) sheet.armorSP = { head:0, torso:0, rightArm:0, leftArm:0, rightLeg:0, leftLeg:0 };
  if(!Array.isArray(sheet.damageTrack) || sheet.damageTrack.length!==40) sheet.damageTrack = Array(40).fill(false);

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
  jpgBtn.addEventListener("click", () => exportCharacterSheetAsJpeg(wrap, sheet));

  const delBtn = document.createElement("button");
  delBtn.className="btn";
  delBtn.type="button";
  delBtn.textContent="Excluir ficha";
  delBtn.addEventListener("click", () => {
    appState.sheets = appState.sheets.filter(s => s.id !== sheet.id);
    scheduleStateSave();
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
  nomeInput.value = sheet.name || "";
  nomeInput.placeholder="Digite o nome...";
  nomeInput.style.marginBottom="6px";
  nomeInput.addEventListener("input", () => {
    sheet.name = nomeInput.value;
    scheduleStateSave();
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
  papelInput.value = sheet.role || "";
  papelInput.placeholder="Digite...";
  papelInput.style.marginBottom="6px";
  papelInput.addEventListener("input", () => {
    sheet.role = papelInput.value;
    scheduleStateSave();
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
    scheduleStateSave();
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
    scheduleStateSave();
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
    scheduleStateSave();
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
    scheduleStateSave();
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
  vitVal.textContent = sheet.vitality ?? "0";
  vitVal.addEventListener("input", ()=>{
    sheet.vitality = vitVal.textContent.trim();
    scheduleStateSave();
  });
  vit.appendChild(vitVal);

  const mtc = document.createElement("div"); mtc.className="mini";
  mtc.innerHTML = `<b>MTC</b>`;
  const mtcVal = document.createElement("div");
  mtcVal.className="val";
  mtcVal.contentEditable="true";
  mtcVal.spellcheck=false;
  mtcVal.textContent = sheet.btm ?? "0";
  mtcVal.addEventListener("input", ()=>{
    sheet.btm = mtcVal.textContent.trim();
    scheduleStateSave();
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
    sheet.stats.push({ name:"", value:"", isFixed:false });
    scheduleStateSave();
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
    sheet.equipment.push({ nome:"", descricao:"", image:null });
    scheduleStateSave();
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
      updateWoundTrack(sheet.damageTrack, abs, checked);

      // Update all checkboxes in THIS track without re-render:
      const boxes = wrap.querySelectorAll(`input.box[data-sheet="${sheet.id}"]`);
      boxes.forEach(b => {
        const i = Number(b.dataset.absIndex);
        b.checked = !!sheet.damageTrack[i];
      });

      scheduleStateSave();
      updateBadges(sheet, wrap);
    }
  });

  return wrap;
}

/* -----------------------------
   Badges
------------------------------*/
function updateBadges(sheet, sheetEl){
  const total = updateMovementAndTotalStats(sheet); // updates correr/saltar in state too
  // reflect correr/saltar and total in DOM if present
  const statusBox = sheetEl.querySelector('[data-list="status"]');
  if(statusBox){
    // update the existing correr/saltar inputs without full rebuild
    for(const card of statusBox.querySelectorAll(".card")){
      const name = card.querySelector('.text-field.grow')?.value?.toLowerCase?.() || "";
      const valInput = card.querySelector('.text-field.small');
      if(!valInput) continue;
      if(name === "run"){
        valInput.value = sheet.stats.find(s => s.name.toLowerCase()==="run")?.value ?? "";
      }
      if(name === "leap"){
        valInput.value = sheet.stats.find(s => s.name.toLowerCase()==="leap")?.value ?? "";
      }
    }
    const totalVal = statusBox.querySelector('input[data-total="1"]');
    if(totalVal) totalVal.value = formatToTwoDecimals(total);
  }

  const dmg = getTotalDamageCount(sheet.damageTrack);
  const arm = armorSum(sheet.armorSP);

  const bTotal = sheetEl.querySelector('[data-badge="total"]');
  const bDmg = sheetEl.querySelector('[data-badge="dmg"]');
  const bArm = sheetEl.querySelector('[data-badge="arm"]');

  if(bTotal) bTotal.textContent = `TOTAL: ${formatToTwoDecimals(total)}`;
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
      cb.checked = !!sheet.damageTrack[abs];
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
    inp.value = String(sheet.armorSP?.[h.key] ?? 0);

    inp.addEventListener("input", ()=>{
      sheet.armorSP[h.key] = parseToSafeNumber(inp.value);
      scheduleStateSave();
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
  const total = updateMovementAndTotalStats(sheet);
  scheduleStateSave();

  sheet.stats.forEach((item, i)=>{
    const nLower = (item.name||"").toLowerCase();
    const isAuto = item.isReadonly || nLower==="run" || nLower==="leap";

    const card = document.createElement("div");
    card.className="card";

    if(!item.isFixed){
      const rm = document.createElement("button");
      rm.className="remove no-export";
      rm.type="button";
      rm.textContent="–";
      rm.addEventListener("click", ()=>{
        sheet.stats.splice(i,1);
        scheduleStateSave();
        renderAll();
      });
      card.appendChild(rm);
    }

    const line = document.createElement("div");
    line.className="two-col";

    const nome = document.createElement("input");
    nome.className="text-field grow";
    nome.value=item.name;
    nome.placeholder="Nome...";
    if(item.isFixed){ nome.readOnly=true; nome.style.opacity="0.9"; }
    nome.addEventListener("input", ()=>{
      item.name = nome.value;
      scheduleStateSave();
      updateBadges(sheet, sheetEl);
    });

    const val = document.createElement("input");
    val.className="text-field small";
    val.value=item.value;
    val.placeholder="0";
    if(isAuto){
      val.readOnly=true;
      val.classList.add("auto");
      val.style.opacity="0.95";
    }
    val.addEventListener("input", ()=>{
      item.value = val.value;
      // updates correr/saltar/total in place
      updateBadges(sheet, sheetEl);
      scheduleStateSave();
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
  totalVal.value=formatToTwoDecimals(total);
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
      scheduleStateSave();
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
      scheduleStateSave();
    });

    const val=document.createElement("input");
    val.className="text-field small";
    val.value=sk.valor ?? "";
    val.placeholder="0";
    val.addEventListener("input", ()=>{
      sk.valor = val.value;
      scheduleStateSave();
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
  sheet.equipment.forEach((eq, i)=>{
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
      sheet.equipment.splice(i,1);
      scheduleStateSave();
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
      scheduleStateSave();
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
      scheduleStateSave();
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
      
      scheduleStateSave();
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
      scheduleStateSave();
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
      scheduleStateSave();
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
  appState.sheets.push(createEmptySheet());
  scheduleStateSave();
  renderAll();
});

document.getElementById("clearAll").addEventListener("click", ()=>{
  localStorage.removeItem(CHARACTER_SHEETS_STORAGE_KEY);
  appState = { sheets: [] };
  appState.sheets.push(createEmptySheet());
  scheduleStateSave();
  renderAll();
});

(function init(){
  if(appState.sheets.length === 0) appState.sheets.push(createEmptySheet());
  renderAll();
})();