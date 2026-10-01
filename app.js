// Configurar la ruta del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const fileInput = document.getElementById('file-input');
const canvas = document.getElementById('pdf-render');
const ctx = canvas.getContext('2d');
const textLayerDiv = document.getElementById('text-layer');
const translationPanel = document.getElementById('translation-panel');
const wordOriginal = document.getElementById('word-original');
const wordTranslation = document.getElementById('word-translation');

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
        alert('Por favor, sube un archivo PDF vÃƒÂ¡lido.');
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
            
            // Renderizar la primera pÃƒÂ¡gina
            renderPage(pageNum);
        }).catch(err => {
            console.error('Error al cargar PDF:', err);
            alert('Error al cargar el PDF.');
        });
    };
    fileReader.readAsArrayBuffer(file);
});

// Variable para guardar el texto actual y leerlo en voz alta
let currentEnglishText = '';
const btnSpeak = document.getElementById('btn-speak');

// Lógica de pronunciación (Text-to-Speech nativo del navegador)
btnSpeak.addEventListener('click', () => {
    if (!currentEnglishText) return;
    
    // Detiene cualquier lectura anterior
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(currentEnglishText);
    utterance.lang = 'en-US'; // Pronunciación en inglés americano
    utterance.rate = 0.9; // Un poco más lento para entender mejor al aprender
    
    // Buscar una voz nativa en inglés si está disponible
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) {
        utterance.voice = englishVoice;
    }
    
    window.speechSynthesis.speak(utterance);
});

// Función que maneja la traducción en el panel derecho
async function translateSelectedText() {
    const selection = window.getSelection();
    let text = selection.toString().trim();
    text = text.replace(/\s+/g, ' ');

    if (text.length > 0) {
        currentEnglishText = text;
        btnSpeak.style.display = 'block'; // Mostrar el botón de altavoz

        if (text.length > 500) {
            wordOriginal.textContent = "Texto muy largo";
            wordTranslation.textContent = "Por favor selecciona menos texto (máximo 500 caracteres).";
        } else {
            wordOriginal.textContent = text.length > 40 ? text.substring(0, 40) + "..." : text;
            wordTranslation.textContent = "Traduciendo...";
            
            try {
                const response = await fetch(\https://api.mymemory.translated.net/get?q=\&langpair=en|es\);
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

// Soporte para Celulares y Tablets (Táctil)
document.addEventListener('touchend', (e) => {
    if (translationPanel.contains(e.target)) return;
    setTimeout(() => {
        const selection = window.getSelection();
        if (selection.toString().trim().length > 0) {
            translateSelectedText();
        }
    }, 300);
});

// Lógica para cambiar el color del resaltado
const colorPicker = document.getElementById('highlight-color');
colorPicker.addEventListener('input', (e) => {
    const hex = e.target.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    document.documentElement.style.setProperty('--highlight-color', \gba(\, \, \, 0.65)\);
});

// Redibujar el PDF si el usuario cambia el tamaño de la ventana o gira el celular
window.addEventListener('resize', () => {
    if (pdfDoc && !pageIsRendering) {
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(() => {
            renderPage(pageNum);
        }, 300);
    }
});
