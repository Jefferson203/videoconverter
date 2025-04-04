document.addEventListener('DOMContentLoaded', function() {
    // Variables globales
    let currentFile = null;
    let currentEditingItem = null;
    let audioContext = null;
    let audioBuffer = null;
    let audioSource = null;
    let isPlaying = false;
    
    // Elementos del DOM
    const fileInput = document.getElementById('file-input');
    const fileButton = document.getElementById('file-button');
    const fileLabel = document.getElementById('file-label');
    const convertButton = document.getElementById('convert-button');
    const renameInput = document.getElementById('rename-input');
    const qualitySelect = document.getElementById('quality-select');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');
    const closeModal = document.querySelectorAll('.close-modal');
    const renameModal = document.getElementById('rename-modal');
    const renameModalInput = document.getElementById('rename-modal-input');
    const renameConfirm = document.getElementById('rename-confirm');
    const renameCancel = document.getElementById('rename-cancel');
    const historyList = document.getElementById('history-list');
    const searchInput = document.getElementById('search-input');
    const youtubeUrlInput = document.getElementById('youtube-url');
    const downloadButton = document.getElementById('download-button');
    const downloadProgress = document.getElementById('download-progress');
    const progressBar = document.querySelector('.progress-bar');
    const progressText = document.querySelector('.progress-text');
    
    // Event listeners
    fileButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    convertButton.addEventListener('click', startConversion);
    tabButtons.forEach(button => button.addEventListener('click', switchTab));
    closeModal.forEach(btn => btn.addEventListener('click', () => {
        modal.style.display = 'none';
        renameModal.style.display = 'none';
    }));
    modalCancel.addEventListener('click', () => modal.style.display = 'none');
    renameCancel.addEventListener('click', () => renameModal.style.display = 'none');
    renameConfirm.addEventListener('click', confirmRename);
    searchInput.addEventListener('input', filterHistory);
    downloadButton.addEventListener('click', downloadFromYoutube);
    
    // Cargar historial al iniciar
    loadHistory();
    
    // Funciones
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const allowedExtensions = ['mp4', 'avi', 'mkv', 'mov'];
        const fileExt = file.name.split('.').pop().toLowerCase();
        
        if (!allowedExtensions.includes(fileExt)) {
            showModal('Error', 'Solo se permiten archivos MP4, AVI, MKV o MOV');
            return;
        }
        
        currentFile = file;
        fileLabel.textContent = `Archivo: ${file.name}`;
        renameInput.value = file.name.split('.').slice(0, -1).join('.');
    }
    
   // Modificar la función startConversion para limpiar después de convertir
   function startConversion() {
    if (!currentFile) {
        showModal('Error', 'Selecciona un archivo primero!');
        return;
    }
    
    const outputName = renameInput.value.trim();
    if (!outputName) {
        showModal('Error', 'Ingresa un nombre válido para el archivo MP3');
        return;
    }
    
    const quality = qualitySelect.value;
    
    // Mostrar progreso
    startConversionProgress(currentFile.name);
    
    const formData = new FormData();
    formData.append('file', currentFile);
    
    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) throw new Error(data.error);
        
        return fetch('/convert', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                filepath: data.filepath,
                output_name: outputName,
                quality: quality
            })
        });
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) throw new Error(data.error);
        
        // 1. Completar la barra al 100%
        updateProgressBar(100);
        
        // 2. Esperar 1 segundo para que se vea completo
        setTimeout(() => {
            // 3. Ocultar la barra con animación
            const progressContainer = document.getElementById('conversion-progress');
            progressContainer.style.opacity = '0';
            progressContainer.style.transition = 'opacity 0.5s ease';
            
            // 4. Mostrar el mensaje después de que desaparezca la barra
            setTimeout(() => {
                progressContainer.style.display = 'none';
                progressContainer.style.opacity = '1'; // Reset para próxima vez
                
                // Limpiar el formulario
                currentFile = null;
                fileInput.value = '';
                fileLabel.textContent = 'Selecciona un video';
                renameInput.value = '';
                
                // Mostrar mensaje de éxito
                showModal('Éxito', `Archivo convertido exitosamente: ${data.filename}`);
                loadHistory();
            }, 500); // Tiempo de la animación
        }, 1000);
    })
    .catch(error => {
        clearInterval(progressInterval);
        document.getElementById('conversion-progress').style.display = 'none';
        showModal('Error', `Error al convertir: ${error.message}`);
    });
}
    
    function switchTab(event) {
        const tabId = event.target.getAttribute('data-tab');
        
        // Actualizar botones de pestaña
        tabButtons.forEach(button => button.classList.remove('active'));
        event.target.classList.add('active');
        
        // Mostrar contenido de pestaña correspondiente
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabId}-tab`).classList.add('active');
    }
    
    function showModal(title, message, confirmCallback = null) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modal.style.display = 'block';
        
        // Configurar botones según si hay callback de confirmación
        if (confirmCallback) {
            modalConfirm.style.display = 'inline-block';
            modalConfirm.onclick = function() {
                confirmCallback();
                modal.style.display = 'none';
            };
        } else {
            modalConfirm.style.display = 'none';
        }
    }
    
// Actualizar la función loadHistory para incluir botón de descarga
function loadHistory() {
    fetch('/list_mp3')
    .then(response => response.json())
    .then(files => {
        historyList.innerHTML = '';
        
        if (files.length === 0) {
            historyList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No hay archivos en tu biblioteca</p>';
            return;
        }
        
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.dataset.path = file.filepath;
            
            item.innerHTML = `
                <div class="history-item-content">
                    <div class="history-item-title">${file.filename}</div>
                    <div class="history-item-path">${file.filepath}</div>
                </div>
                <div class="history-item-actions">
                    <button class="play-button" title="Reproducir">
                        <span class="material-icons">play_circle_outline</span>
                    </button>
                    <button class="download-button" title="Descargar">
                        <span class="material-icons">file_download</span>
                    </button>
                    <button class="edit-button" title="Renombrar">
                        <span class="material-icons">edit</span>
                    </button>
                    <button class="delete-button" title="Eliminar">
                        <span class="material-icons">delete</span>
                    </button>
                </div>
            `;
            
            historyList.appendChild(item);
            
            // Añadir event listeners
            const playBtn = item.querySelector('.play-button');
            const downloadBtn = item.querySelector('.download-button');
            const editBtn = item.querySelector('.edit-button');
            const deleteBtn = item.querySelector('.delete-button');
            
            playBtn.addEventListener('click', () => toggleAudio(file.filepath, playBtn));
            downloadBtn.addEventListener('click', () => downloadAudio(file.filepath));
            editBtn.addEventListener('click', () => editHistoryItem(file.filepath));
            deleteBtn.addEventListener('click', () => deleteHistoryItem(file.filepath, item));
        });
    })
    .catch(error => {
        console.error('Error loading history:', error);
        historyList.innerHTML = '<p style="text-align: center; color: var(--error-color);">Error al cargar la biblioteca</p>';
    });
}

function downloadAudio(filePath) {
    // Extraer solo el nombre del archivo
    const fileName = filePath.split('\\').pop().split('/').pop();
    const downloadUrl = `/downloads/${encodeURIComponent(fileName)}`;
    
    // Crear enlace temporal invisible
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;  // Esto indica al navegador que debe descargar
    link.style.display = 'none';
    
    // Añadir al DOM y hacer clic
    document.body.appendChild(link);
    link.click();
    
    // Limpiar después de un segundo
    setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
    }, 1000);
}

// Variables globales actualizadas
let audioPlayer = null;  // Elemento de audio HTML5
let currentlyPlaying = null;  // Ruta del archivo actualmente en reproducción

function toggleAudio(filePath, button) {
    const icon = button.querySelector('.material-icons');
    const fileName = filePath.split('\\').pop();
    const downloadUrl = `/downloads/${encodeURIComponent(fileName)}`;

    // Si no existe el reproductor, lo creamos
    if (!audioPlayer) {
        audioPlayer = new Audio();
    }

    // Si es el mismo archivo que ya se está reproduciendo
    if (currentlyPlaying === filePath) {
        if (!audioPlayer.paused) {
            // Pausar la reproducción
            audioPlayer.pause();
            icon.textContent = 'play_circle_outline';
        } else {
            // Reanudar la reproducción
            audioPlayer.play()
                .then(() => {
                    icon.textContent = 'pause_circle_outline';
                })
                .catch(error => {
                    showModal('Error', `No se pudo reanudar el audio: ${error.message}`);
                });
        }
        return;
    }

    // Si es un archivo diferente, detener cualquier reproducción previa
    stopAllAudio();

    // Configurar el nuevo audio
    audioPlayer.src = downloadUrl;
    currentlyPlaying = filePath;

    audioPlayer.play()
        .then(() => {
            // Actualizar todos los botones de reproducción
            updateAllPlayButtons('pause_circle_outline', filePath);
        })
        .catch(error => {
            showModal('Error', `No se pudo reproducir el audio: ${error.message}`);
            currentlyPlaying = null;
        });

    // Manejar cuando termine la reproducción
    audioPlayer.onended = () => {
        updateAllPlayButtons('play_circle_outline');
        currentlyPlaying = null;
    };
}

// Función para detener toda reproducción
function stopAllAudio() {
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }
    updateAllPlayButtons('play_circle_outline');
    currentlyPlaying = null;
}

// Función para actualizar todos los botones de reproducción
function updateAllPlayButtons(iconName, currentFilePath = null) {
    document.querySelectorAll('.play-button').forEach(btn => {
        const item = btn.closest('.history-item');
        if (item) {
            const itemPath = item.dataset.path;
            if (!currentFilePath || itemPath === currentFilePath) {
                btn.querySelector('.material-icons').textContent = iconName;
            }
        }
    });
}
    
function editHistoryItem(filePath) {
    // Extraer solo el nombre del archivo (sin la ruta y sin extensión)
    const fileName = filePath.split('\\').pop().split('/').pop(); // Maneja ambos separadores
    const baseName = fileName.split('.').slice(0, -1).join('.');
    
    currentEditingItem = filePath;
    renameModalInput.value = baseName;
    renameModal.style.display = 'block';
}

function confirmRename() {
    const newName = renameModalInput.value.trim();
    if (!newName) {
        showModal('Error', 'Ingresa un nombre válido');
        return;
    }
    
    const oldPath = currentEditingItem;
    const ext = oldPath.split('.').pop();
    const newFileName = `${newName}.${ext}`;
    const newPath = oldPath.replace(/[^\\\/]+$/, newFileName);
    
    fetch('/rename_mp3', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            old_path: oldPath,
            new_path: newPath
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) throw new Error(data.error);
        
        showModal('Éxito', `Archivo renombrado a: ${newFileName}`);
        renameModal.style.display = 'none';
        loadHistory(); // Actualizar la lista
    })
    .catch(error => {
        showModal('Error', `No se pudo renombrar: ${error.message}`);
    });
}

    
    // Modificar la función deleteHistoryItem para llamar al servidor
    function deleteHistoryItem(filePath, item) {
        showModal(
            'Confirmar eliminación',
            `¿Eliminar "${filePath.split('/').pop()}" permanentemente?\n\nEsta acción no se puede deshacer.`,
            () => {
                fetch('/delete_mp3', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({filepath: filePath})
                })
                .then(response => response.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    
                    item.remove();
                    showModal('Éxito', 'Archivo eliminado correctamente');
                    
                    // Si estaba reproduciendo este archivo, detenerlo
                    if (isPlaying && audioSource) {
                        audioSource.stop();
                        audioSource = null;
                        isPlaying = false;
                    }
                })
                .catch(error => {
                    showModal('Error', `No se pudo eliminar: ${error.message}`);
                });
            }
        );
    }
    
    function filterHistory() {
        const searchTerm = searchInput.value.toLowerCase();
        const items = historyList.querySelectorAll('.history-item');
        
        items.forEach(item => {
            const title = item.querySelector('.history-item-title').textContent.toLowerCase();
            const path = item.querySelector('.history-item-path').textContent.toLowerCase();
            
            if (title.includes(searchTerm) || path.includes(searchTerm)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    function downloadFromYoutube() {
        const url = youtubeUrlInput.value.trim();
        if (!url) {
            showModal('Error', 'Ingresa una URL de YouTube válida');
            return;
        }
        
        // Validar URL de YouTube
        if (!url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/)) {
            showModal('Error', 'La URL no parece ser de YouTube');
            return;
        }
        
        downloadProgress.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = 'Preparando descarga...';
        
        fetch('/youtube', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: url })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Simular progreso (en una implementación real usarías WebSockets o polling)
            simulateProgress(data);
        })
        .catch(error => {
            downloadProgress.style.display = 'none';
            showModal('Error', `Error al descargar: ${error.message}`);
        });
    }
    
    function simulateProgress(data) {
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 10;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                
                progressBar.style.width = '100%';
                progressText.textContent = 'Descarga completada!';
                
                setTimeout(() => {
                    downloadProgress.style.display = 'none';
                    showModal('Éxito', `Video descargado: ${data.filename}`);
                    loadHistory(); // Actualizar la lista
                }, 1000);
            } else {
                progressBar.style.width = `${progress}%`;
                progressText.textContent = `Descargando... ${Math.floor(progress)}%`;
            }
        }, 500);
    }
    
    // Cerrar modal al hacer clic fuera del contenido
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
        if (event.target === renameModal) {
            renameModal.style.display = 'none';
        }
    });



    // Variables para el progreso
let progressInterval;
let startTime;

// Función para iniciar el progreso de conversión
function startConversionProgress(filename) {
    // Mostrar el contenedor
    document.getElementById('conversion-progress').style.display = 'block';
    document.getElementById('progress-filename').textContent = `Archivo: ${filename}`;
    
    // Resetear la barra
    document.getElementById('conversion-bar').style.width = '0%';
    document.getElementById('progress-percent').textContent = '0%';
    
    // Guardar tiempo de inicio
    startTime = new Date();
    updateElapsedTime();
    
    // Simular progreso (en producción usarías WebSocket o polling)
    let progress = 0;
    clearInterval(progressInterval);
    
    progressInterval = setInterval(() => {
        progress += Math.random() * 5;
        if (progress >= 100) {
            progress = 100;
            clearInterval(progressInterval);
            setTimeout(() => {
                document.getElementById('conversion-progress').style.display = 'none';
            }, 2000);
        }
        
        updateProgressBar(progress);
    }, 500);
}

// Función para actualizar la barra de progreso
function updateProgressBar(percent) {
    const progressBar = document.getElementById('conversion-bar');
    const percentElement = document.getElementById('progress-percent');
    
    percent = Math.min(100, Math.max(0, percent));
    progressBar.style.width = `${percent}%`;
    percentElement.textContent = `${Math.floor(percent)}%`;
    
    // Cambiar color según el progreso
    if (percent < 30) {
        progressBar.style.background = 'linear-gradient(90deg, #FF5722, #FF9800)';
    } else if (percent < 70) {
        progressBar.style.background = 'linear-gradient(90deg, #FF9800, #FFEB3B)';
    } else {
        progressBar.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
    }
    
    updateElapsedTime();
}

// Función para actualizar el tiempo transcurrido
function updateElapsedTime() {
    const now = new Date();
    const elapsed = Math.floor((now - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    document.getElementById('progress-time').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}





});