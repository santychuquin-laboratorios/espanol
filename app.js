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

// Escuchar la subida de un archivo
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file.type !== 'application/pdf') {
        alert('Por favor, sube un archivo PDF vÃ¡lido.');
        return;
    }

    const fileReader = new FileReader();
    fileReader.onload = function() {
        const typedarray = new Uint8Array(this.result);
        
        // Cargar el documento PDF
        pdfjsLib.getDocument({data: typedarray}).promise.then(pdfDoc_ => {
            pdfDoc = pdfDoc_;
            pageCountDisplay.textContent = pdfDoc.numPages;
            pageNum = 1;
            
            // UI Updates
            welcomeMessage.classList.add('hidden');
            pdfWrapper.classList.remove('hidden');
            pageControls.classList.remove('hidden');
            
            // Renderizar la primera pÃ¡gina
            renderPage(pageNum);
        }).catch(err => {
            console.error('Error al cargar PDF:', err);
            alert('Error al cargar el PDF.');
        });
    };
    fileReader.readAsArrayBuffer(file);
});

// FunciÃ³n para renderizar una pÃ¡gina del PDF
function renderPage(num) {
    pageIsRendering = true;

    // Obtener la pÃ¡gina
    pdfDoc.getPage(num).then(page => {
        // Cálculo responsive de la escala
        let scale = 1.5; // Escala por defecto para PC
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const wrapperWidth = document.getElementById('pdf-wrapper').clientWidth;
        
        // Si el PDF es más ancho que el contenedor (especialmente en celulares), lo ajustamos
        if (wrapperWidth > 0 && unscaledViewport.width > wrapperWidth - 40) {
            scale = (wrapperWidth - 40) / unscaledViewport.width; 
        } else if (window.innerWidth < 768) {
            scale = (window.innerWidth - 60) / unscaledViewport.width;
        }

        const viewport = page.getViewport({ scale });

        // Soporte para pantallas de alta resolución (Celulares, Tablets, pantallas Retina)
        const outputScale = window.devicePixelRatio || 1;

        // Ajustar el tamaño real del canvas multiplicándolo por la densidad de píxeles
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        
        // Mantener el tamaño visual (CSS) normal
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        // Limpiar la capa de texto anterior
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.height = Math.floor(viewport.height) + 'px';
        textLayerDiv.style.width = Math.floor(viewport.width) + 'px';
        
        // Esta variable CSS permite que pdf_viewer.css escale las letras a la perfección
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);

        // Transformación para que el contexto del dibujo entienda la alta resolución
        const transform = outputScale !== 1 
            ? [outputScale, 0, 0, outputScale, 0, 0] 
            : null;

        // Opciones de renderizado para el canvas
        const renderCtx = {
            canvasContext: ctx,
            transform: transform,
            viewport: viewport
        };

        // Renderizar pÃ¡gina en el canvas
        const renderTask = page.render(renderCtx);

        // Renderizar la capa de texto
        renderTask.promise.then(() => {
            pageIsRendering = false;
            
            if (pageNumIsPending !== null) {
                renderPage(pageNumIsPending);
                pageNumIsPending = null;
            }
            
            return page.getTextContent();
        }).then(textContent => {
            // Asignar el texto a la capa
            pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: []
            });
        });

        // Actualizar UI de paginaciÃ³n
        pageNumDisplay.textContent = num;
        prevPageBtn.disabled = num <= 1;
        nextPageBtn.disabled = num >= pdfDoc.numPages;
    });
}

// Queue rendering
function queueRenderPage(num) {
    if (pageIsRendering) {
        pageNumIsPending = num;
    } else {
        renderPage(num);
    }
}

// Pagination Event Listeners
prevPageBtn.addEventListener('click', () => {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
});

nextPageBtn.addEventListener('click', () => {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
});

// Lógica de pronunciación (Text-to-Speech nativo del navegador)
btnSpeak.addEventListener('click', () => {
    if (!currentEnglishText) return;
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(currentEnglishText);
    utterance.lang = 'en-US';
    utterance.rate = 0.85; // Un poco más lento para ver el resaltado
    
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) {
        utterance.voice = englishVoice;
    }

    // Subrayar palabra por palabra mientras habla
    utterance.onboundary = (event) => {
        if (event.name === 'word') {
            const charIndex = event.charIndex;
            let charLength = event.charLength;
            
            // Fallback si el navegador no soporta charLength
            if (!charLength) {
                const match = currentEnglishText.substring(charIndex).match(/^[a-zA-Z0-9_'\u00C0-\u00FF]+/);
                charLength = match ? match[0].length : 1;
            }
            
            const before = currentEnglishText.substring(0, charIndex);
            const word = currentEnglishText.substring(charIndex, charIndex + charLength);
            const after = currentEnglishText.substring(charIndex + charLength);
            
            // Función rápida para evitar que inyecte HTML
            const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            wordOriginal.innerHTML = esc(before) + '<span class="speaking-highlight">' + esc(word) + '</span>' + esc(after);
        }
    };

    // Al terminar, dejar el texto normal
    utterance.onend = () => {
        wordOriginal.textContent = currentEnglishText;
    };

    window.speechSynthesis.speak(utterance);
});

// Función que maneja la traducción
async function translateSelectedText() {
    const selection = window.getSelection();
    let text = selection.toString().trim();
    text = text.replace(/\s+/g, ' ');

    if (text.length > 0) {
        currentEnglishText = text;
        btnSpeak.style.display = 'block';

        if (text.length > 500) {
            wordOriginal.textContent = "Texto muy largo";
            wordTranslation.textContent = "Por favor selecciona menos texto (máximo 500 caracteres).";
        } else {
            // Mostrar todo el texto completo sin cortar
            wordOriginal.textContent = text;
            wordTranslation.textContent = "Traduciendo...";
            
            try {
                const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|es`);
                const data = await response.json();
                
                if (data && data.responseData && data.responseData.translatedText) {
                    wordTranslation.textContent = data.responseData.translatedText;
                } else {
                    wordTranslation.textContent = "No se encontró traducción.";
                }
            } catch (error) {
                console.error("Error al traducir:", error);
                wordTranslation.textContent = "Error al conectar con el traductor.";
            }
        }
    }
}

// Lógica 1: Doble clic en una palabra (traduce al instante)
document.addEventListener('dblclick', (e) => {
    if (translationPanel.contains(e.target)) return;
    const selection = window.getSelection();
    if (selection.toString().trim().length > 0) {
        translateSelectedText();
    }
});

// Lógica 2: Resaltar texto y presionar "Enter"
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const selection = window.getSelection();
        if (selection.toString().trim().length > 0) {
            e.preventDefault();
            translateSelectedText();
        }
    }
});

// Lógica para cambiar el color del resaltado
const colorPicker = document.getElementById('highlight-color');
colorPicker.addEventListener('input', (e) => {
    const hex = e.target.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    document.documentElement.style.setProperty('--highlight-color', `rgba(${r}, ${g}, ${b}, 0.65)`);
});

// Redibujar el PDF si el usuario cambia el tamaño de la ventana o gira el celular
window.addEventListener('resize', () => {
    if (pdfDoc && !pageIsRendering) {
        // Añadimos un pequeño retraso para no sobrecargar el navegador al redimensionar
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(() => {
            renderPage(pageNum);
        }, 300);
    }
});


// Soporte para Celulares y Tablets (Táctil)
document.addEventListener('touchend', (e) => {
    if (translationPanel.contains(e.target)) return;
    
    // Pequeño retraso para dejar que el sistema operativo termine de seleccionar el texto
    setTimeout(() => {
        const selection = window.getSelection();
        if (selection.toString().trim().length > 0) {
            translateSelectedText();
        }
    }, 300);
});

