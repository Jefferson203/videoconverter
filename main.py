from flask import Flask, render_template, request, jsonify, send_from_directory,Response
import os
from werkzeug.utils import secure_filename
from moviepy.video.io.VideoFileClip import VideoFileClip
import yt_dlp
import threading
import re
import time
import json

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB limit
app.config['ALLOWED_EXTENSIONS'] = {'mp4', 'avi', 'mkv', 'mov'}

# Crear directorios si no existen
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'filepath': filepath
        })
    
    return jsonify({'error': 'Invalid file type'}), 400


@app.route('/downloads/<filename>')
def download_file(filename):
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    # Verificar que el archivo existe
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    
    # Determinar el tipo MIME basado en la extensión
    mimetype = 'audio/mpeg' if filename.lower().endswith('.mp3') else None
    
    return send_from_directory(
        app.config['UPLOAD_FOLDER'],
        filename,
        as_attachment=False,
        mimetype=mimetype
    )

# Añadir esta función para listar archivos MP3
@app.route('/list_mp3')
def list_mp3():
    mp3_files = [f for f in os.listdir(app.config['UPLOAD_FOLDER']) if f.endswith('.mp3')]
    return jsonify([{
        'filename': f,
        'filepath': os.path.join(app.config['UPLOAD_FOLDER'], f)
    } for f in mp3_files])


# Añadir esta función para limpiar archivos no MP3
def clean_uploads_folder():
    for filename in os.listdir(app.config['UPLOAD_FOLDER']):
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        try:
            if not filename.lower().endswith('.mp3'):
                os.remove(filepath)
        except Exception as e:
            print(f"Error eliminando {filename}: {str(e)}")

# Modificar la ruta de conversión
@app.route('/convert', methods=['POST'])
def convert_to_mp3():
    data = request.json
    filepath = data.get('filepath')
    output_name = data.get('output_name')
    quality = data.get('quality', '128k')
    
    if not filepath or not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    
    try:
        # Asegurar nombre seguro y extensión .mp3
        output_name = secure_filename(output_name)
        if not output_name.lower().endswith('.mp3'):
            output_name += '.mp3'
        
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_name)
        
        # Manejar archivos duplicados
        counter = 1
        while os.path.exists(output_path):
            name, ext = os.path.splitext(output_name)
            output_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{name}({counter}){ext}")
            counter += 1
        
        # Convertir video a MP3
        clip = VideoFileClip(filepath)
        clip.audio.write_audiofile(output_path, bitrate=quality)
        clip.close()
        
        # Eliminar el archivo original
        if os.path.exists(filepath):
            os.remove(filepath)
        
        # Limpiar otros archivos temporales
        clean_uploads_folder()
        
        return jsonify({
            'success': True,
            'filename': os.path.basename(output_path),
            'download_url': f"/downloads/{os.path.basename(output_path)}"
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/delete_mp3', methods=['POST'])
def delete_mp3():
    data = request.json
    filepath = data.get('filepath')
    
    if not filepath:
        return jsonify({'error': 'No file path provided'}), 400
    
    try:
        # Asegurarse que el archivo está en el directorio permitido
        if not filepath.startswith(app.config['UPLOAD_FOLDER']):
            return jsonify({'error': 'Invalid file path'}), 403
        
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/convert_progress')
def convert_progress():
    def generate():
        # Simular progreso (en producción usarías ffmpeg con callback de progreso)
        for i in range(101):
            progress_data = {
                'percent': i,
                'time_elapsed': i * 0.2,
                'speed': f"{i * 50} KB/s"
            }
            yield f"data: {json.dumps(progress_data)}\n\n"
            time.sleep(0.1)
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/rename_mp3', methods=['POST'])
def rename_mp3():
    data = request.json
    old_path = data.get('old_path')
    new_path = data.get('new_path')
    
    if not old_path or not new_path:
        return jsonify({'error': 'Rutas no proporcionadas'}), 400
    
    try:
        # Verificar que el archivo original existe
        if not os.path.exists(old_path):
            return jsonify({'error': 'Archivo original no encontrado'}), 404
        
        # Verificar que no estamos intentando mover fuera del directorio permitido
        if not os.path.abspath(new_path).startswith(os.path.abspath(app.config['UPLOAD_FOLDER'])):
            return jsonify({'error': 'Ruta de destino no permitida'}), 403
        
        # Renombrar el archivo físico
        os.rename(old_path, new_path)
        
        return jsonify({
            'success': True,
            'new_path': new_path
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/youtube', methods=['POST'])
def download_youtube():
    data = request.json
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    download_complete = threading.Event()
    result_container = {'result': None}

    def download_thread():
        try:
            ydl_opts = {
                'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                'outtmpl': os.path.join(app.config['UPLOAD_FOLDER'], '%(title)s.%(ext)s'),
                'quiet': False,
                'merge_output_format': 'mp4',
                'postprocessors': [{
                    'key': 'FFmpegVideoConvertor',
                    'preferedformat': 'mp4',
                }],
                # Añadir headers para parecer un navegador real
                'http_headers': {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': 'https://www.youtube.com/',
                },
                # Configuraciones para evitar bloqueos
                'retries': 3,
                'fragment_retries': 3,
                'extractor_retries': 3,
                'no_check_certificate': True,
                'ignoreerrors': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Primero verificar si la URL es accesible
                try:
                    info = ydl.extract_info(url, download=False)
                except Exception as e:
                    if "HTTP Error 429" in str(e):
                        return jsonify({'error': 'YouTube ha bloqueado temporalmente las descargas desde esta IP. Por favor, espera unas horas o usa una VPN.'}), 429
                    raise
                
                video_title = info.get('title', 'video_descargado')
                safe_title = re.sub(r'[\\/*?:"<>|]', "", video_title)
                ydl.download([url])
                
                downloaded_files = [f for f in os.listdir(app.config['UPLOAD_FOLDER']) 
                                  if f.lower().endswith(('.mp4', '.mkv', '.webm')) and 
                                  os.path.getsize(os.path.join(app.config['UPLOAD_FOLDER'], f)) > 0]
                
                if downloaded_files:
                    result_container['result'] = {
                        'success': True,
                        'filename': downloaded_files[0],
                        'filepath': os.path.join(app.config['UPLOAD_FOLDER'], downloaded_files[0])
                    }
                else:
                    result_container['result'] = {'error': 'No se encontró el archivo descargado', 'status': 404}
                    
        except Exception as e:
            result_container['result'] = {'error': str(e), 'status': 500}
        finally:
            download_complete.set()

    thread = threading.Thread(target=download_thread)
    thread.start()
    download_complete.wait(timeout=300)
    
    if result_container['result'] is None:
        return jsonify({'error': 'Tiempo de espera agotado', 'status': 408}), 408
    
    if 'error' in result_container['result']:
        return jsonify({'error': result_container['result']['error']}), result_container['result'].get('status', 500)
    
    return jsonify(result_container['result'])

if __name__ == '__main__':
    app.run(debug=True)