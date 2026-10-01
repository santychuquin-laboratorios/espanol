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
            alert('Error al procesar el archivo PDF. Asegúrate de que no esté dañado.');
        });
    } catch (err) {
        console.error('Error al iniciar lectura:', err);
        alert('Ocurrió un error al intentar leer el archivo.');
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

// Cargar al iniciar la página
loadLastPDF();

// Escuchar la subida de un archivo nuevo
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
        alert('Por favor, sube un archivo PDF válido.');
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

// Función para renderizar una página del PDF
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
    };

    window.speechSynthesis.speak(utterance);
});

async function translateSelectedText() {
    const selection = window.getSelection();
    let text = selection.toString().trim();
    text = text.replace(/\s+/g, ' ');

    if (text.length > 0) {
        currentEnglishText = text;
        btnSpeak.style.display = 'block';

        wordOriginal.textContent = text;
        
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
            const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=en|es`);
            const data = await response.json();
            
            if (data && data.responseData && data.responseData.translatedText) {
                let translatedPart = data.responseData.translatedText;
                if (untranslatedText) {
                    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    wordTranslation.innerHTML = esc(translatedPart) + ' <span style="color: #94a3b8; font-style: italic;" title="Texto excede el límite de 500 caracteres gratuitos"> ' + esc(untranslatedText) + '</span>';
                } else {
                    wordTranslation.textContent = translatedPart;
                }
            } else {
                wordTranslation.textContent = "No se encontró traducción.";
            }
        } catch (error) {
            console.error("Error al traducir:", error);
            wordTranslation.textContent = "Error al conectar con el traductor.";
        }
    }
}

document.addEventListener('dblclick', (e) => {
    if (translationPanel.contains(e.target)) return;
    const selection = window.getSelection();
    if (selection.toString().trim().length > 0) {
        translateSelectedText();
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
    document.documentElement.style.setProperty('--highlight-color', `rgba(${r}, ${g}, ${b}, 0.65)`);
});

window.addEventListener('resize', () => {
    if (pdfDoc && !pageIsRendering) {
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(() => {
            renderPage(pageNum);
        }, 300);
    }
});

document.addEventListener('touchend', (e) => {
    if (translationPanel.contains(e.target)) return;
    setTimeout(() => {
        const selection = window.getSelection();
        if (selection.toString().trim().length > 0) {
            translateSelectedText();
        }
    }, 300);
});
