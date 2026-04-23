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
 * Creates the action bar with Export and Delete buttons
 * @param {HTMLElement} sheetWrapper - The element to be exported/deleted 
 * @param {object} sheetData - The data object of the character.
 * @returns {HTMLElement} The container with all action buttons. 
 */
function createSheetActions(sheetWrapper, sheetData) {
  const actionsContainer = document.createElement("div");
  actionsContainer.className = "sheet-buttons";

  // 1. Button: Export PDF
  const pdfBtn = createActionButton("Exportar PDF", () => {
    exportCharacterSheetAsPdf(sheetWrapper, sheetData);
  });

  // 2. Button: Export JPEG
  const jpgBtn = createActionButton("Exportar JPEG", () => {
    exportCharacterSheetAsJpeg(sheetWrapper, sheetData);
  });

  // 3. Button: Delete (With logic to update the app state)
  const deleteBtn = createActionButton("Excluir ficha", () => {
    appState.sheets = appState.sheets.filter(s => s.id !== sheetData.id);

    scheduleStateSave();
    renderAllSheets();
  });

  actionsContainer.append(pdfBtn, jpgBtn, deleteBtn);

  return actionsContainer;
}

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
 * @returns {DocumentFragment} - It returns two HTML elements, the drop zone and action buttons.
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

/**
 * Creates the entire Skills section, including the dynamic list and the add button
 * @param {object} sheet - The character data object
 * @param {HTMLElement} wrap - The main sheet wrapper (needed for the render function).
 * @returns {DocumentFragment}
 */
function createSkillsSection (sheet, wrap) {
  const fragment = document.createDocumentFragment();

  // 1. Header
  const header = createSectionHeader("PERÍCIAS");
  header.style.marginTop = "12px";

  // 2. Row Container
  const skillRow = document.createElement("div");
  skillRow.className = "row";

  // 3. The List (Stack)
  const skillList = document.createElement("div");
  skillList.className = "stack";
  skillList.dataset.list = "skills"

  // 4. Add Button (+)
  const addBtn = document.createElement("div");
  addBtn.className = "plus no-export";
  addBtn.textContent = "+";

  addBtn.addEventListener("click", () => {
    sheet.skills.push({ nome: "", valor: "" });
    scheduleStateSave();
    renderAllSheets();
  });

  skillRow.appendChild(skillList);
  skillRow.appendChild(addBtn);

  fragment.appendChild(header);
  fragment.appendChild(skillRow);

  // 5. Pupulate the list
  renderSkillsList(sheet, skillList, wrap);

  return fragment;
}

/**
 * Creates a small stat block (like VIT or MTC)
 * @param {object} sheet - The data object. 
 * @param {string} label - The label text.
 * @param {string} property - The property in the sheet object 
 * @returns {HTMLElement}
 */
function createMiniStat(sheet, label, property) {
  const mini = document.createElement("div");
  mini.className = "mini";
  mini.innerHTML = `<b>${label}</b>`

  const val = document.createElement("div");
  val.className = "val";
  val.contentEditable = "true";
  val.spellcheck = false;
  val.textContent = sheet[property] ?? "0";

  val.addEventListener("input", () => {
    sheet[property] = val.textContent.trim();
    scheduleStateSave();
  });

  mini.appendChild(val);
  return mini;
}

/**
 * Generic factory to create a section with a header and a dynamic list (+ button).
 * @param {object} sheet - The character data object. 
 * @param {string} title - Header text (e.g., "STATUS"). 
 * @param {string} listType - The data-list identifier for the CSS/Logic 
 * @param {object} newItemTemplate - The object structure to add to the array. 
 * @param {string} arrayName - The property name in the sheet object (e.g., "equipment") 
 * @param {function} renderCallback - The function that populates the list (e.g., renderEquipList).
 * @param {HTMLElement} wrap - The seet wrapper
 * @returns {DocumentFragment}
 */
function createDynamicListSection(sheet, title, listType, newItemTemplate, arrayName, renderCallback, wrap) {
  const fragment = document.createDocumentFragment();

  // 1. Header
  fragment.appendChild(createSectionHeader(title));

  // 2. Row Container
  const row = document.createElement("div");
  row.className = "row";

  // 3. The List (Stack)
  const listContainer = document.createElement("div");
  listContainer.className = "stack";
  listContainer.dataset.list = listType;

  // 4. Add Button (+)
  const addBtn = document.createElement("div");
  addBtn.className = "plus no-export";
  addBtn.textContent = "+";

  addBtn.addEventListener("click", () => {
    sheet[arrayName].push(newItemTemplate);
    scheduleStateSave();
    renderAllSheets();
  });

  row.appendChild(listContainer);
  row.appendChild(addBtn);
  fragment.appendChild(row);

  // 5. Populate
  renderCallback(sheet, listContainer, wrap);

  return fragment;
}

/* -----------------------------
   Render Sheet (sem re-render enquanto digita)
------------------------------*/
function renderSheet(sheet){
  // normaliza
  if(!sheet.armorSP) sheet.armorSP = { head:0, torso:0, rightArm:0, leftArm:0, rightLeg:0, leftLeg:0 };
  if(!Array.isArray(sheet.damageTrack) || sheet.damageTrack.length!==40) sheet.damageTrack = Array(40).fill(false);

  const sheetContainer = document.createElement("div");
  sheetContainer.className = "sheet";
  sheetContainer.dataset.sheetId = sheet.id;

  // sheet header
  const head = document.createElement("div");
  head.className = "sheet-head no-export";

  const title = document.createElement("div");
  title.className = "sheet-title";
  title.textContent = "FICHA";

  // Buttons to export/delete
  const actionButtons = createSheetActions(sheetContainer, sheet);

  head.appendChild(title);
  head.appendChild(actionButtons);

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
  const rightColumn = document.createElement("div");

  // PERICIAS (moved to right column, below nome)
  rightColumn.appendChild(createSkillsSection(sheet, sheetContainer));

  // VIT/MTC (moved to right column, below skills)
  const miniStatsContainer = document.createElement("div");
  miniStatsContainer.className="mini-stats";

  miniStatsContainer.appendChild(createMiniStat(sheet, "VIT", "vitality"));
  miniStatsContainer.appendChild(createMiniStat(sheet, "MTC", "btm"));

  rightColumn.appendChild(miniStatsContainer);

  // Damage Track and Armor
  rightColumn.appendChild(renderTrack(sheet, sheetContainer));
  rightColumn.appendChild(renderArmor(sheet, sheetContainer));

  // Third column for STATUS + EQUIP
  const thirdColumn = document.createElement("div");

  // STATUS
  thirdColumn.appendChild(createDynamicListSection(
    sheet,
    "STATUS",
    "status",
    { name: "", value: "", isFixed: false},
    "stats",
    renderStatusList,
    sheetContainer
  ));

  // EQUIP
  thirdColumn.appendChild(createDynamicListSection(
    sheet,
    "EQUIPAMENTO",
    "equips",
    { nome: "", descricao: "", image: null},
    "equipment",
    renderEquipList,
    sheetContainer
  ));

  // mount
  grid.appendChild(bigImage);
  grid.appendChild(rightColumn);
  grid.appendChild(thirdColumn);

  sheetContainer.appendChild(head);
  sheetContainer.appendChild(grid);

  // update badges initially
  updateBadges(sheet, sheetContainer);

  // Event delegation for damage clicks inside this sheet:
  // 'sheetContainer' watches the changes
  sheetContainer.addEventListener("change", (event) => {
    const elementChanged = event.target;

    // 1. Verification: Is the interected element an input or checkbox? 
    if(!(elementChanged instanceof HTMLInputElement)) return;
    if(elementChanged.classList.contains("box") && elementChanged.dataset.absIndex){

      const indexInTrack = Number(elementChanged.dataset.absIndex);
      const isMarked = elementChanged.checked;

      // 2. Update the data inside the object in the sheet
      updateWoundTrack(sheet.damageTrack, indexInTrack, isMarked);

      // 3. Update all checkboxes in THIS track without re-render:
      const allDamageBoxes = sheetContainer.querySelectorAll(`input.box[data-sheet="${sheet.id}"]`);

      allDamageBoxes.forEach(checkbox => {
        const currentIndex = Number(checkbox.dataset.absIndex);
        // Ensure the UI is exactly what's in the data (state)
        checkbox.checked = !!sheet.damageTrack[currentIndex];
      });

      scheduleStateSave();
      updateBadges(sheet, sheetContainer);
    }
  });

  return sheetContainer;
}

/* -----------------------------
   Badges
------------------------------*/
/**
 * Helper function to update the text content of a specific badge.
 * @param {HTMLElement} parent - The container to search within.
 * @param {string} badgeType - The value of the data-badge attribute. 
 * @param {string} text - The new text to display.
 */
function updateBadgeText(parent, badgeType, text) {
  const badge = parent.querySelector(`[data-badge="${badgeType}"]`);
  if (badge) badge.textContent = text;
}

/**
 * Scans the status list and updates specific calculated fields (Run/Leap)
 * to reflect changes in movement without a full re-render.
 * @param {object} sheet - The character data object.
 * @param {HTMLElement} sheetEl - The sheet DOM element 
 */
function updateStatusInputs(sheet, sheetEl) {
  const statusContainer = sheetEl.querySelector('[data-list="status"]');
  if (!statusContainer) return;

  // We iterate through each status card to find the ones that need auto-calculation
  const statusCards = statusContainer.querySelectorAll(".card");

  statusCards.forEach(card => {
    const nameInput = card.querySelector('.text-field.grow');
    const valueInput = card.querySelector('.text-field.small');

    if (!nameInput || !valueInput) return;

    const statusName = nameInput.value.toLowerCase().trim();

    // Logic for "Run"
    if (statusName === "run") {
      const runData = sheet.stats.find(s => s.name.toLowerCase() === "run");
      valueInput.value = runData?.value ?? "";
    }

    // Logic for "Leap"
    if (statusName === "leap") {
      const leapData = sheet.stats.find(s => s.name.toLowerCase() === "leap");
      valueInput.value = leapData?.value ?? "";
    }
  });

  // Update the total sum box of the values
  const totalValues = statusContainer.querySelector('input[data-total="1"]');
  if (totalValues) {
    totalValues.value = formatToTwoDecimals(updateMovementAndTotalStats(sheet));
  }

}

/**
 * Updates all visual indicators (badges) and calculated fields on the sheet.
 * Acts as the primary synchronization point between State and UI for real-time stats.
 * @param {object} sheet - The character data object. 
 * @param {HTMLElement} sheetElement - The sheet DOM element.
 */
function updateBadges(sheet, sheetElement) {
  // 1. Calculate current totals from the state
  const totalStats = updateMovementAndTotalStats(sheet);
  const damageCount = getTotalDamageCount(sheet.damageTrack);
  const armorProtection = armorSum(sheet.armorSP);

  // 2. Synchronize specific inputs in the Status column
  updateStatusInputs(sheet, sheetElement);
  
  // 3. Update the summary badges
  updateBadgeText(sheetElement, "total", `TOTAL: ${formatToTwoDecimals(totalStats)}`);
  updateBadgeText(sheetElement, "dmg", `DANO: ${damageCount}/40`);
  updateBadgeText(sheetElement, "arm", `PB: ${armorProtection}`);
}

/* =============================
   Track renderer (data attrs p/ delegation)
============================= */

/**
 * Renders the health track (Damage Track) for the character sheet
 * Generates 40 checkboxes divided into severity levels and stun save indicators.
 * @param {object} sheet - The character data object.
 * @returns {HTMLElement} The complete track container.
 */
function renderTrack(sheet){
  const trackContainer = document.createElement("div");
  trackContainer.className = "track";

  // Damage Level labels as per Cyberpunk 2020 rules
  const groupsTop = ["LEVE","GRAVE","CRÍTICO","MORTAL-0","MORTAL-1"];
  const groupsBottom = ["MORTAL-2","MORTAL-3","MORTAL-4","MORTAL-5","MORTAL-6"];

  const firstGrid = document.createElement("div");
  firstGrid.className = "track-grid";

  let globalGroupCounter = 0;

  /**
   * Internal factory to create a damage group (4 boxes per level)
   * @param {string} title - Level name (e.g., "GRAVE")
   * @param {number} groupIndex - Current group sequence for index calculation.
   */
  function makeGroup(title, groupIndex){
    const levelElement = document.createElement("div");
    levelElement.className="lvl";

    const titleElement = document.createElement("div");
    titleElement.className = "lvl-title";
    titleElement.textContent = title;

    const boxesContainer = document.createElement("div");
    boxesContainer.className="boxes";

    for(let i = 0; i < 4; i++){
      const absoluteIndex = groupIndex * 4 + i;
      const checkbox = document.createElement("input");

      checkbox.type="checkbox";
      checkbox.className="box";

      // Double bang (!!) ensures a boolean value from the array
      checkbox.checked = !!sheet.damageTrack[absoluteIndex];

      // Critical for Event Delegation
      checkbox.dataset.absIndex = String(absoluteIndex);
      checkbox.dataset.sheet = sheet.id; // helps find within sheet

      boxesContainer.appendChild(checkbox);
    }

    levelElement.appendChild(titleElement);
    levelElement.appendChild(boxesContainer);
    return levelElement;
  }

  // Build Top Grid
  groupsTop.forEach(title => {
    firstGrid.appendChild(makeGroup(title, globalGroupCounter));
    globalGroupCounter++;
  });

  // Create Stun rows (Helper function could be used here for DRY)
  const stunRow1 = createStunRow(0, 5);

  const secondGrid = document.createElement("div");
  secondGrid.className="track-grid second";

  groupsBottom.forEach(title => {
    secondGrid.appendChild(makeGroup(title, globalGroupCounter));
    globalGroupCounter++;
  });

  const stunRow2 = createStunRow(5, 10);

  trackContainer.append(firstGrid, stunRow1, secondGrid, stunRow2);
  return trackContainer;
}

/**
 * Helper to create stun save indicator rows
 * @param {number} start - The first number of the row
 * @param {number} end - The last number in the row minus one
 * @returns {HTMLElement} - The row with stun levels
 */
function createStunRow(start, end) {
  const row = document.createElement("div");
  row.className = "atord-row";

  for (let i = start; i < end; i++) {
    const stunIndicator = document.createElement("div");
    stunIndicator.className = "atord";
    stunIndicator.textContent = `atord-${i}`;
    row.appendChild(stunIndicator);
  }
  return row;
}

/* =============================
   Armor renderer (updates badges live)
============================= */
/**
 * Renders the armor Stopping Power (SP) table.
 * Links each body part to its specific protection value in the state.
 * @param {object} sheet - The character data object.
 * @param {HTMLElement} sheetEl - The sheet container for badge updates. 
 * @returns {HTMLElement} The armor table container.
 */
function renderArmor(sheet, sheetEl){
  const armorWrap = document.createElement("div");
  armorWrap.className = "armor";

  const table = document.createElement("table");

  // 1. Define the body parts and their hit dice ranges
  const bodyParts = [
    { key:"head", label:"Cabeça", range: "1" },
    { key:"torso",  label:"Torso", range: "2-4" },
    { key:"rightArm", label:"Braço D.", range: "5" },
    { key:"RightArm", label:"Braço E", range: "6" },
    { key:"RightLeg", label:"Perna D.", range: "7-8" },
    { key:"LeftLeg", label:"Perna E.", range: "9-0" }
  ];

  // 2. Crate Header Row (Labels)
  const headerRow = document.createElement("tr");
  headerRow.appendChild(createTableCell("th", "Localização", "loc"));

  bodyParts.forEach(part => {
    headerRow.appendChild(createTableCell("th", part.label));
  });
  table.appendChild(headerRow);

  // 3. Create Dice Range Row
  const diceRow = document.createElement("tr");
  diceRow.appendChild(createTableCell("th", "", "sub"))

  bodyParts.forEach(part => {
    diceRow.appendChild(createTableCell("th", part.range, "sub"));
  });
  table.appendChild(diceRow);

  // 4. Create Input Row (Values)
  const inputRow = document.createElement("tr");
  inputRow.appendChild(createTableCell("td", "Blindagem PB", "pb"));

  bodyParts.forEach(part => {
    const cell = document.createElement("td");
    const input = document.createElement("input");

    input.type="number";
    input.step = "1";
    input.value = String(sheet.armorSP?.[part.key] ?? 0);

    input.addEventListener("input", () => {
      // Updates state and triggers UI sync
      sheet.armorSP[part.key] = parseToSafeNumber(input.value);
      scheduleStateSave();
      updateBadges(sheet, sheetEl);
    });

    cell.appendChild(input);
    inputRow.appendChild(cell);
  });

  table.appendChild(inputRow);
  armorWrap.appendChild(table);
  return armorWrap;
}

/**
 * Helper to create table cells (th/td) with less boilerplate
 * @param {string} type - Type of tag of the table (th/td)
 * @param {string} text - Text that will be written in the cell
 * @param {string} className - Class of the tag if it has.
 * @returns {HTMLElement} - The cell of the table
 */
function createTableCell(type, text, className = "") {
  const cell = document.createElement(type);
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
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