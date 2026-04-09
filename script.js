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

/**
 * Captures the sheet as an image and embeds it into a multi-page PDF
 * Uses a coordinate shift logic to handle sheets longer than a single A4 page
 * @param {HTMLElement} sheetElement - The DOM element to capture 
 * @param {object} characterData - The character object for naming the file.
 */
async function exportCharacterSheetAsPdf(sheetElement, characterData) {
  // 1. Preparation: Hide non-exportable elements
  const elementsToHide = sheetElement.querySelectorAll(".no-export");
  elementsToHide.forEach(el => el.style.display = "none");

  try {
    // 2. Capture the sheet as a High-Quality Canvas
    const canvas = await html2canvas(sheetElement, { 
      scale: 2, 
      backgroundColor: "#ffffff", 
      useCORS: true 
    });
    const imageData = canvas.toDataURL("image/jpeg", 0.95);

    // Restore visibility immediately after capture
    elementsToHide.forEach(el => el.style.display = "");

    // 3. Initialize jsPDF (p = portrait, mm = millimeters, a4 = paper size)
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    // 4. Calculate Dimensions
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Calculate the image height relative to the A4 width
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // 5. Multi-page Logic (The "Sliding Window" technique)
    let heightLeft = imgHeight;
    let verticalPosition = 0;

    while(heightLeft > 0) {
      // Add the SAME image, but shifted upwards (verticalPosition becomes more negative)
      pdf.addImage(imageData, "JPEG", 0, verticalPosition, imgWidth, imgHeight);

      heightLeft -= pageHeight;
      verticalPosition -= pageHeight;

      // If there is still image left to show, add a new blank page
      if(heightLeft > 0) {
        pdf.addPage();
      } 
    }

    // 6. Save the final document
    const baseName = characterData.name 
      ? `Cyberpunk_sheet_${formatSafeFileName(characterData.name)}` 
      : `Cyberpunk_sheet_${characterData.id}`;

    pdf.save(baseName + ".pdf");
  } catch {error}
    console.error("Error generating PDF: ", error);
    elementsToHide.forEach(el => el.style.display = "");
}

/**
 * Reads a File object and converts it into a Base64 DataURL string.
 * This is useful for displaying uploaded images immediately in the UI
 * @param {File} file - The file object from an <input type="file">.
 * @returns {Promise<string>} A promise that resolves with the DataURL string
 */
function convertFileToDataURL(file){
  return new Promise((resolve, reject) => {
    // 1. Initialize the built-in File Reader
    const reader = new FileReader();

    // 2. Success Handler: When the file is fully read, resolve the promise
    reader.onload = () => resolve(reader.result);

    // 3. Error Handler: If something goes wrong (permissions, corruption), reject
    reader.onerror = () => reject(new Error("Failed to read file."));

    // 4. Start the reading process as a Data URL (Base64)
    reader.readAsDataURL(file);
  });
}

/* =============================
  UI RENDERING ENGINE
============================= */

/**
 * Main container for all character sheet elements in the DOM.
 */
const sheetsContainer = document.getElementById("allFichas");

/**
 * Clears the current UI and rebuilds all character sheets from the application state.
 * This ensures the view is always synchronized with the data
 */
function renderAllSheets(){
  // 1. "Wipe the slate clean": Removes all existing HTML inside the container
  sheetsContainer.innerHTML = "";

  // 2. Iterate through each sheet data object in the global state
  for(const sheetData of appState.sheets) {
    // 3. Create the physical HTML element for the sheet and inject it into the DOM.
    sheetsContainer.appendChild(renderSheet(sheetData));
  }
}

// Check about the using of this function
function getSheetById(id){
  return appState.sheets.find(s => s.id === id);
}

/* -----------------------------
  Rendering Helpers
------------------------------*/
/**
 * Creates a stylized section header for the sheet
 * @param {string} title - The text to display (e.g., "STATUS", "EQUIP")
 * @param {string} marginBottom - The marginBottom value to be used in the element. Standard value is 4px
 * @returns {HTMLElement} The header element.
 */
function createSectionHeader(title, marginBottom = "4px") {
  const header = document.createElement("div");
  header.className = "section-header";
  header.style.width = "fit-content";
  header.style.marginBottom = marginBottom;
  header.textContent = title;
  return header;
}

/**
 * Creates a standardized button with a click event
 * @param {string} label - Button text.
 * @param {function} onClick - Function to execute when clicked.
 * @param {string} extraClass - Optiona class (like 'no-export')
 * @returns {HTMLElement} The button element
 */
function createActionButton(label, onClick, extraClass = "") {
  const btn = document.createElement("button");
  btn.className = `btn ${extraClass}`.trim();
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

/**
 * Creates a text input linked to a specific property of the character sheet.
 * @param {object} sheet - The character data object.
 * @param {string} property - The property name (e.g., "name", "role").
 * @param {string} placeHolder - Help text 
 * @returns {HTMLElement} - The input element
 */
function createLinkedInput(sheet, property, placeHolder) {
  const input = document.createElement("input");
  input.className = "text-field";
  input.value = sheet[property] || "";
  input.placeholder = placeHolder;
  input.style.marginBottom = "6px";

  input.addEventListener("input", () => {
    sheet[property] = input.value;
    scheduleStateSave();
  });

  return input;
}

/**
 * Creates a complete image uploader component with Drag & Drop and Preview.
 * @param {object} sheet - The character data object. 
 * @returns {HTMLElement} - It returns two HTML elements, the drop zone and action buttons.
 */
function createImageUploader(sheet) {
  const fragment = document.createDocumentFragment();

  // 1. Create the Drop Zone (The 'X' box)
  const dropZone = document.createElement("div");
  dropZone.className = "image-drop";

  const placeHolderText = document.createElement("span");
  placeHolderText.textContent = "X"

  const previewImg = document.createElement("img");
  previewImg.alt = "preview"

  // Initial State Check
  if (sheet.mainImage) {
    previewImg.src = sheet.mainImage;
    previewImg.style.display = "block";
    placeHolderText.style.display = "none";
  }

  dropZone.appendChild(placeHolderText);
  dropZone.appendChild(previewImg);

  // 2. Drag & Drop Logic
  dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    dropZone.style.opacity = "0.85";
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.style.opacity = "1";
  });

  dropZone.addEventListener("drop", async e => {
    e.preventDefault();
    dropZone.style.opacity = "1";
    const file = e.dataTransfer.files?.[0];
    if (file) await handleImageUpdate(file, sheet, previewImg, placeHolderText);
  });

  // 3. Action Buttons (Upload / Remove)
  const actions = document.createElement("div");
  actions.className = "image-actions no-export";

  // Hidden File Input
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.hidden = true;

  const uploadBtn = createActionButton("Enviar imagem", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (file) await handleImageUpdate(file, sheet, previewImg, placeHolderText);
  });

  const removeBtn = createActionButton("Remover", () => {
    fileInput.value = "";
    sheet.mainImage = null;
    previewImg.removeAttribute("src");
    previewImg.style.display = "none";
    placeHolderText.style.display = "block";
    scheduleStateSave();
  });

  const imgHint = document.createElement("div");
  imgHint.className="hint";
  imgHint.textContent="X = você pode pôr imagem";

  actions.appendChild(uploadBtn);
  actions.appendChild(removeBtn);
  actions.appendChild(imgHint);
  actions.appendChild(fileInput); // Keep it hidden inside

  fragment.appendChild(dropZone);
  fragment.appendChild(actions);

  return fragment;
}

/**
 * Helper to process the image file and update UI/State
 * @param {object} file - A DataTransfer object that contains the file dragged and dropped. 
 * @param {object} sheet - The character data object. 
 * @param {HTMLElement} imgEl - The HTML element that the image will be showed.
 * @param {HTMLElement} spanEl - The HTML element that holds the placeholder
 */
async function handleImageUpdate(file, sheet, imgEl, spanEl) {
  const dataUrl = await convertFileToDataURL(file);
  sheet.mainImage = dataUrl;
  imgEl.src = dataUrl;
  imgEl.style.display = "block";
  spanEl.style.display = "none";
  scheduleStateSave();
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
  pdfBtn.addEventListener("click", () => exportCharacterSheetAsPdf(wrap, sheet));

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
    renderAllSheets();
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
  bigImage.appendChild(createSectionHeader("NOME"))
  bigImage.appendChild(createLinkedInput(sheet, "name", "Digite o nome..."))

  // PAPEL (below nome)
  bigImage.appendChild(createSectionHeader("PAPEL"));
  bigImage.appendChild(createLinkedInput(sheet, "role", "Digite o papel (ex: Solo, Netrunner)..."));

  // Character photo uploader and buttons for controlling it.
  bigImage.appendChild(createImageUploader(sheet));

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
    renderAllSheets(); // estrutural
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
    renderAllSheets(); // estrutural
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
    renderAllSheets(); // estrutural
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
        renderAllSheets();
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
      renderAllSheets();
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
      renderAllSheets();
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
      const dataUrl = await convertFileToDataURL(file);
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
  renderAllSheets();
});

document.getElementById("clearAll").addEventListener("click", ()=>{
  localStorage.removeItem(CHARACTER_SHEETS_STORAGE_KEY);
  appState = { sheets: [] };
  appState.sheets.push(createEmptySheet());
  scheduleStateSave();
  renderAllSheets();
});

(function init(){
  if(appState.sheets.length === 0) appState.sheets.push(createEmptySheet());
  renderAllSheets();
})();