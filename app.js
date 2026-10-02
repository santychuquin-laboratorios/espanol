// Configurar la ruta del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const fileInput = document.getElementById('file-input');
const canvas = document.getElementById('pdf-render');
const ctx = canvas.getContext('2d');
const textLayerDiv = document.getElementById('text-layer');

const translationPanel = document.getElementById('translation-panel');
const wordOriginal = document.getElementById('word-original');
const wordTranslation = document.getElementById('word-translation');
const btnSpeak = document.getElementById('btn-speak');
const btnStop = document.getElementById('btn-stop');
let currentEnglishText = '';

// UI Elements
const welcomeMessage = document.getElementById('welcome-message');
const pdfWrapper = document.getElementById('pdf-wrapper');
const pageControls = document.getElementById('page-controls');
const pageNumDisplay = document.getElementById('page-num');
const pageCountDisplay = document.getElementById('page-count');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');

let pdfDoc = null;
let pageNum = 1;
let pageIsRendering = false;
let pageNumIsPending = null;

// --- Memoria del PDF (IndexedDB) ---
const DB_NAME = "PDFReaderDB";
const STORE_NAME = "pdfStore";

function openDB() {
    return new Promise((resolve, reject) => {
        try {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        } catch(e) {
            reject(e);
        }
    });
}

async function savePDFToDB(arrayBuffer) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put(arrayBuffer, "lastPDF");
    } catch (e) {
        console.error("Error guardando el PDF:", e);
    }
}

function loadPDFData(arrayBuffer, initialPage = 1) {
    try {
        const typedarray = new Uint8Array(arrayBuffer);
        pdfjsLib.getDocument({data: typedarray}).promise.then(pdfDoc_ => {
            pdfDoc = pdfDoc_;
            pageCountDisplay.textContent = pdfDoc.numPages;
            pageNum = initialPage > pdfDoc.numPages ? 1 : initialPage;
            
            welcomeMessage.classList.add('hidden');
            pdfWrapper.classList.remove('hidden');
            pageControls.classList.remove('hidden');
            
            renderPage(pageNum);
        }).catch(err => {
            console.error('Error al cargar PDF:', err);
            alert('Error al procesar el archivo PDF. Aseg\u00FArate de que no est\u00E9 da\u00F1ado.');
        });
    } catch (err) {
        console.error('Error al iniciar lectura:', err);
        alert('Ocurri\u00F3 un error al intentar leer el archivo.');
    }
}

async function loadLastPDF() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get("lastPDF");
        
        request.onsuccess = () => {
            if (request.result) {
                let initialPage = 1;
                try {
                    const savedPage = localStorage.getItem('pdfLastPage');
                    if (savedPage) initialPage = parseInt(savedPage);
                } catch(e) {}
                loadPDFData(request.result, initialPage);
            }
        };
    } catch (e) {
        console.log("No hay PDF guardado previamente o no hay acceso a DB.");
    }
}

// Cargar al iniciar la pÃƒÂ¡gina
loadLastPDF();

// Escuchar la subida de un archivo nuevo
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
        alert('Por favor, sube un archivo PDF v\u00E1lido.');
        return;
    }

    const fileReader = new FileReader();
    fileReader.onload = function() {
        try { localStorage.setItem('pdfLastPage', '1'); } catch(e) {}
        loadPDFData(this.result, 1);
        savePDFToDB(this.result);
        e.target.value = ''; // Clear input safely AFTER reading
    };
    fileReader.onerror = function() {
        alert("No se pudo leer el archivo de tu computadora.");
    };
    fileReader.readAsArrayBuffer(file);
});

// FunciÃƒÂ³n para renderizar una pÃƒÂ¡gina del PDF
function renderPage(num) {
    pageIsRendering = true;

    pdfDoc.getPage(num).then(page => {
        let scale = 1.5;
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const wrapperWidth = document.getElementById('pdf-wrapper').clientWidth;
        
        if (wrapperWidth > 0) {
            scale = (wrapperWidth - 40) / unscaledViewport.width;
            if (scale > 3.0) scale = 3.0;
        }

        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        textLayerDiv.innerHTML = '';
        textLayerDiv.style.height = Math.floor(viewport.height) + 'px';
        textLayerDiv.style.width = Math.floor(viewport.width) + 'px';
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
        if (interactionMode === 0 && isTouchDevice) textLayerDiv.style.pointerEvents = 'none'; else textLayerDiv.style.pointerEvents = 'auto';

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        const renderCtx = {
            canvasContext: ctx,
            transform: transform,
            viewport: viewport
        };

        const renderTask = page.render(renderCtx);

        renderTask.promise.then(() => {
            pageIsRendering = false;
            
            if (pageNumIsPending !== null) {
                renderPage(pageNumIsPending);
                pageNumIsPending = null;
            }
            
            return page.getTextContent();
        }).then(textContent => {
            pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: []
            });
        });

        pageNumDisplay.textContent = num;
        prevPageBtn.disabled = num <= 1;
        nextPageBtn.disabled = num >= pdfDoc.numPages;
    });
}

function queueRenderPage(num) {
    if (pageIsRendering) {
        pageNumIsPending = num;
    } else {
        renderPage(num);
    }
}

prevPageBtn.addEventListener('click', () => {
    if (pageNum <= 1) return;
    pageNum--;
    try { localStorage.setItem('pdfLastPage', pageNum); } catch(e) {}
    queueRenderPage(pageNum);
});

nextPageBtn.addEventListener('click', () => {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    try { localStorage.setItem('pdfLastPage', pageNum); } catch(e) {}
    queueRenderPage(pageNum);
});

// Text-to-Speech
btnSpeak.addEventListener('click', () => {
    if (!currentEnglishText) return;
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(currentEnglishText);
    utterance.lang = 'en-US';
    utterance.rate = 0.85;
    
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) {
        utterance.voice = englishVoice;
    }

    utterance.onboundary = (event) => {
        if (event.name === 'word') {
            const charIndex = event.charIndex;
            let charLength = event.charLength;
            
            if (!charLength) {
                const match = currentEnglishText.substring(charIndex).match(/^[a-zA-Z0-9_'\u00C0-\u00FF]+/);
                charLength = match ? match[0].length : 1;
            }
            
            const before = currentEnglishText.substring(0, charIndex);
            const word = currentEnglishText.substring(charIndex, charIndex + charLength);
            const after = currentEnglishText.substring(charIndex + charLength);
            
            const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            wordOriginal.innerHTML = esc(before) + '<span class="speaking-highlight">' + esc(word) + '</span>' + esc(after);
        }
    };

    utterance.onend = () => {
        wordOriginal.textContent = currentEnglishText;
        btnSpeak.style.display = 'block';
        btnStop.style.display = 'none';
    };

    window.speechSynthesis.speak(utterance);
    btnSpeak.style.display = 'none';
    btnStop.style.display = 'block';
});

btnStop.addEventListener('click', () => {
    window.speechSynthesis.cancel();
    btnSpeak.style.display = 'block';
    btnStop.style.display = 'none';
    wordOriginal.textContent = currentEnglishText;
});

async function performTranslation(text) {
    if (text.length > 0) {
        currentEnglishText = text;
        btnSpeak.style.display = 'block';
        btnStop.style.display = 'none';
        window.speechSynthesis.cancel();

        if (document.activeElement !== wordOriginal) {
            wordOriginal.textContent = text;
        }
        
        let textToTranslate = text;
        let untranslatedText = "";
        
        if (text.length > 500) {
            let splitIndex = text.lastIndexOf(" ", 500);
            if (splitIndex === -1) splitIndex = 500;
            textToTranslate = text.substring(0, splitIndex);
            untranslatedText = text.substring(splitIndex);
        }

        wordTranslation.textContent = "Traduciendo...";
        
        try {
            const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=` + encodeURIComponent(textToTranslate));
            const data = await response.json();
            
            if (data && data[0]) {
                let translatedPart = data[0].map(item => item[0]).join('');
                if (untranslatedText) {
                    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    wordTranslation.innerHTML = esc(translatedPart) + ' <span style="color: #94a3b8; font-style: italic;" title="Texto excede el l\u00EDmite de 500 caracteres gratuitos"> ' + esc(untranslatedText) + '</span>';
                } else {
                    wordTranslation.textContent = translatedPart;
                }
            } else {
                wordTranslation.textContent = "No se encontr\u00F3 traducci\u00F3n.";
            }
        } catch (error) {
            console.error("Error al traducir:", error);
            wordTranslation.textContent = "Error al conectar con el traductor.";
        }
    }
}

async function translateSelectedText() {
    const selection = window.getSelection();
    let text = selection.toString().trim();
    text = text.replace(/\s+/g, ' ');
    if (text.length > 0 && text !== currentEnglishText) {
        await performTranslation(text);
    }
}

wordOriginal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        let text = wordOriginal.textContent.trim();
        text = text.replace(/\s+/g, ' ');
        if (text.length > 0 && text !== "Selecciona un texto para traducir..." && text !== "Escribe aqu\u00ED para traducir...") {
            performTranslation(text);
            wordOriginal.blur();
        }
    }
});

wordOriginal.addEventListener('focus', () => {
    if (wordOriginal.textContent.trim() === "Selecciona un texto para traducir..." || wordOriginal.textContent.trim() === "Escribe aqu\u00ED para traducir...") {
        wordOriginal.textContent = "";
    }
});

wordOriginal.addEventListener('blur', () => {
    if (wordOriginal.textContent.trim() === "") {
        wordOriginal.textContent = "Escribe aqu\u00ED para traducir...";
    }
});



document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const selection = window.getSelection();
        if (selection.toString().trim().length > 0) {
            e.preventDefault();
            translateSelectedText();
        }
    }
});

const colorPicker = document.getElementById('highlight-color');
colorPicker.addEventListener('input', (e) => {
    const hex = e.target.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    document.documentElement.style.setProperty('--highlight-color', `rgba(${r}, ${g}, ${b}, 0.45)`);
});

window.addEventListener('resize', () => {
    if (pdfDoc && !pageIsRendering) {
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(() => {
            renderPage(pageNum);
        }, 300);
    }
});

let lastTap = 0;
let isTouchInteraction = false;

document.addEventListener('touchstart', () => {
    isTouchInteraction = true;
}, {passive: true});

document.addEventListener('mousedown', () => {
    isTouchInteraction = false;
}, {passive: true});

let selectionTimeout = null;
document.addEventListener('selectionchange', () => {
    if (!isTouchInteraction) return;
    
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
        const selection = window.getSelection();
        if (selection.toString().trim().length > 0) {
            translateSelectedText();
        }
    }, 600); // 600ms debounce
});



document.addEventListener('touchend', (e) => {
    if (translationPanel.contains(e.target)) return;
    setTimeout(() => {
        const selection = window.getSelection();
        if (selection.toString().trim().length > 0) {
            translateSelectedText();
        }
    }, 400);
});


















window.addEventListener('contextmenu', (e) => {
    if (isTouchInteraction) {
        e.preventDefault();
    }
});






// Lógica para alternar entre Modo Leer y Modo Resaltador a mano alzada
let interactionMode = 0;
let isHighlighting = false;
let isErasing = false;
let highlightedSpans = new Set();
const toolRead = document.getElementById('tool-read');
const toolHighlight = document.getElementById('tool-highlight');
const toolErase = document.getElementById('tool-erase');
const tabletTools = document.getElementById('tablet-tools');

const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
if (!isTouchDevice && tabletTools) {
    tabletTools.style.display = 'none'; // Ocultar barra de dibujo en PC
}

function setTool(mode) {
    interactionMode = mode;
    const textLayer = document.getElementById('text-layer');
    
    if (toolRead) toolRead.classList.toggle('active', mode === 0);
    if (toolHighlight) toolHighlight.classList.toggle('active', mode === 1);
    if (toolErase) toolErase.classList.toggle('active', mode === 2);

    if (mode === 0) {
        document.body.classList.remove('highlight-mode');
        if (textLayer) textLayer.style.pointerEvents = isTouchDevice ? 'none' : 'auto';
        window.getSelection().removeAllRanges();
    } else {
        document.body.classList.add('highlight-mode');
        if (textLayer) textLayer.style.pointerEvents = 'auto';
    }
}

if (toolRead) toolRead.addEventListener('click', () => setTool(0));
if (toolHighlight) toolHighlight.addEventListener('click', () => setTool(1));
if (toolErase) toolErase.addEventListener('click', () => setTool(2));

// Al renderizar una página nueva, restauramos el estado del pointerEvents

function processHighlight(x, y) {
    const el = document.elementFromPoint(x, y);
    if (el && el.tagName.toLowerCase() === 'span' && el.closest('.textLayer')) {
        if (isErasing) {
            el.classList.remove('custom-highlight');
            highlightedSpans.delete(el);
        } else {
            el.classList.add('custom-highlight');
            highlightedSpans.add(el);
        }
    }
}

function clearHighlights() {
    highlightedSpans.forEach(el => el.classList.remove('custom-highlight'));
    highlightedSpans.clear();
}

function finishHighlight() {
    if (!isHighlighting) return;
    isHighlighting = false;
    
    if (highlightedSpans.size > 0) {
        const highlightActions = document.getElementById('highlight-actions');
        if (highlightActions) highlightActions.style.display = 'flex';
    }
}

const btnTranslateHighlight = document.getElementById('btn-translate-highlight');
const btnClearHighlight = document.getElementById('btn-clear-highlight');

if (btnTranslateHighlight) {
    btnTranslateHighlight.addEventListener('click', () => {
        if (highlightedSpans.size > 0) {
            const textArr = Array.from(highlightedSpans).map(span => span.textContent);
            const text = textArr.join(' ').replace(/\s+/g, ' ').trim();
            if (text) {
                window.getSelection().removeAllRanges();
                performTranslation(text);
            }
        }
    });
}

if (btnClearHighlight) {
    btnClearHighlight.addEventListener('click', () => {
        clearHighlights();
            const ha = document.getElementById('highlight-actions'); if(ha) ha.style.display = 'none';
        const highlightActions = document.getElementById('highlight-actions');
        if (highlightActions) highlightActions.style.display = 'none';
        wordTranslation.textContent = '';
        wordOriginal.textContent = 'Selecciona un texto para traducir...';
    });
}

// Eventos Táctiles (Tablet)
let lastTapTime = 0;

function getWordRangeFromPoint(x, y) {
    if (!document.caretRangeFromPoint) return null;
    const range = document.caretRangeFromPoint(x, y);
    if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    
    const node = range.startContainer;
    const offset = range.startOffset;
    const text = node.nodeValue;
    
    let start = offset;
    while (start > 0 && /\w|[\u00C0-\u00FF']/.test(text[start - 1])) start--;
    let end = offset;
    while (end < text.length && /\w|[\u00C0-\u00FF']/.test(text[end])) end++;
    
    if (start < end) {
        const wordRange = document.createRange();
        wordRange.setStart(node, start);
        wordRange.setEnd(node, end);
        return wordRange;
    }
    return null;
}

let tapStartX = 0;
let tapStartY = 0;

document.addEventListener('touchstart', (e) => {

    
    if (interactionMode === 0) return;
    if (e.target.closest('.textLayer')) {
        isHighlighting = true;
        isErasing = (interactionMode === 2);
        processHighlight(e.touches[0].clientX, e.touches[0].clientY);
    }
}, {passive: false});

document.addEventListener('touchmove', (e) => {
    if (!isHighlighting || interactionMode === 0) return;
    e.preventDefault(); // Detener el scroll nativo al pintar
    processHighlight(e.touches[0].clientX, e.touches[0].clientY);
}, {passive: false});

document.addEventListener('touchend', (e) => {

    finishHighlight();
});



document.addEventListener('mousemove', (e) => {
    if (!isHighlighting) return;
    e.preventDefault();
    processHighlight(e.clientX, e.clientY);
});

document.addEventListener('mouseup', () => {
    finishHighlight();
});























document.addEventListener('dblclick', (e) => {
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouchDevice && e.target.closest('.textLayer')) {
        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            if (text) {
                performTranslation(text);
            }
        }, 50);
    }
});


