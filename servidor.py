# ==================== VERIFICACIÓN DE LIBRERÍAS ====================
import sys

def verificar_librerias():
    faltantes = []
    try: import flask
    except ImportError: faltantes.append('flask')
    try: import flask_cors
    except ImportError: faltantes.append('flask-cors')
    try: import requests
    except ImportError: faltantes.append('requests')
    try: import bs4
    except ImportError: faltantes.append('beautifulsoup4')
    
    if faltantes:
        print("=" * 60)
        print("❌ FALTAN LIBRERÍAS DE PYTHON")
        print("=" * 60)
        print(f"Faltan: {', '.join(faltantes)}")
        print()
        print("👉 Solución: abrí una terminal y ejecutá este comando:")
        print()
        print("   python -m pip install flask flask-cors requests beautifulsoup4")
        print()
        print("=" * 60)
        sys.exit(1)

verificar_librerias()

# ==================== IMPORTS ====================
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import re
from datetime import datetime, timedelta
import os

app = Flask(__name__)
CORS(app)

# ==================== CONFIGURACIÓN ====================
# URL base de Zaaz
URL_BASE = "https://zaaz.purpura-lab.com/admin/operaciones/reserva-cupos/cupos/asignar"

# ==================== COOKIE ====================
ARCHIVO_COOKIE = "cookie.txt"

def leer_cookie():
    """Lee la cookie desde cookie.txt. Si no existe, crea un template."""
    if not os.path.exists(ARCHIVO_COOKIE):
        with open(ARCHIVO_COOKIE, 'w', encoding='utf-8') as f:
            f.write("# ============================================================\n")
            f.write("# PEGA AQUÍ TU COOKIE DE ZAAZ (una sola línea, sin comillas)\n")
            f.write("# ============================================================\n")
            f.write("# Cómo obtenerla:\n")
            f.write("#   1. Abrí Zaaz en Chrome y logueate\n")
            f.write("#   2. F12 → pestaña Network\n")
            f.write("#   3. Refrescá la página\n")
            f.write("#   4. Click en cualquier request\n")
            f.write("#   5. Buscá el header 'Cookie' → copia TODO su valor\n")
            f.write("#   6. Reemplazá la línea de abajo con ese valor\n")
            f.write("# ============================================================\n")
            f.write("\n")
            f.write("PEGA_TU_COOKIE_AQUI\n")
        print("=" * 60)
        print("⚠️ NO EXISTÍA cookie.txt. Se creó un archivo nuevo.")
        print("=" * 60)
        print()
        print(f"👉 Abrí el archivo: {os.path.abspath(ARCHIVO_COOKIE)}")
        print("👉 Pegá tu cookie de Zaaz en la última línea.")
        print("👉 Guardá y volvé a correr 'python servidor.py'.")
        print()
        print("=" * 60)
        sys.exit(1)
    
    with open(ARCHIVO_COOKIE, 'r', encoding='utf-8') as f:
        contenido = f.read()
    
    # Filtrar líneas vacías y comentarios
    lineas_utiles = [
        l.strip() for l in contenido.splitlines()
        if l.strip() and not l.strip().startswith('#')
    ]
    
    if not lineas_utiles:
        print("⚠️ cookie.txt está vacío o solo tiene comentarios.")
        sys.exit(1)
    
    cookie = lineas_utiles[0]
    
    if cookie == 'PEGA_TU_COOKIE_AQUI' or len(cookie) < 30:
        print("⚠️ cookie.txt todavía tiene el placeholder o la cookie es muy corta.")
        print("   Editalo con una cookie real y volvé a intentar.")
        sys.exit(1)
    
    return cookie

# ==================== ESTADO GLOBAL ====================
base_inicial_ids = set()
primera_carga_completada = False

# ==================== FUNCIONES ====================
def normalizar_texto(texto):
    if not texto:
        return ""
    return re.sub(r'\s+', ' ', str(texto)).strip()

def descargar_datos_zaaz(fecha_str, cookie):
    url = f"{URL_BASE}?date={fecha_str}&download=1"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": cookie,
        "Referer": f"{URL_BASE}?date={fecha_str}",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
    
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code != 200:
        resp = requests.get(f"{URL_BASE}?date={fecha_str}", headers=headers, timeout=30)
    
    return resp.text

class SesionExpirada(Exception):
    pass

def extraer_filas_tabla(html_raw):
    with open("respuesta_zaaz_debug.html", "w", encoding="utf-8") as f:
        f.write(html_raw)

    print(f"📥 Respuesta recibida de Zaaz: {len(html_raw)} caracteres.")

    if "login" in html_raw.lower() or "iniciar sesión" in html_raw.lower() or "ingresar al sistema" in html_raw.lower():
        print("⚠️ ALERTA: La respuesta contiene pantalla de Login. Tu cookie expiró.")
        print("   👉 Editá cookie.txt con una cookie nueva.")
        raise SesionExpirada("La sesión de Zaaz expiró. Actualiza cookie.txt con una cookie nueva.")

    soup = BeautifulSoup(html_raw, 'html.parser')
    table = soup.find('table')
    if not table:
        print("⚠️ No se encontró ninguna <table> en el HTML recibido de Zaaz.")
        return []
    
    headers = []
    thead = table.find('thead')
    if thead:
        headers = [normalizar_texto(th.get_text()) for th in thead.find_all('th')]
    
    print(f"📋 Encabezados detectados ({len(headers)}):", headers[:6])
    
    filas = []
    tbody = table.find('tbody') or table
    for tr in tbody.find_all('tr'):
        celdas = tr.find_all('td')
        if not celdas:
            continue
        row = {}
        for idx, td in enumerate(celdas):
            clave = headers[idx] if idx < len(headers) else f"col_{idx}"
            row[clave] = normalizar_texto(td.get_text())
        filas.append(row)
        
    print(f"📊 Total de filas procesadas: {len(filas)}")
    return filas

# ==================== RUTAS ====================
@app.route('/api/sincronizar', methods=['GET'])
def sincronizar():
    global base_inicial_ids, primera_carga_completada
    tipo = request.args.get('tipo', 'seguimiento')
    
    try:
        cookie = leer_cookie()
    except SystemExit:
        return jsonify({"status": "error", "mensaje": "cookie.txt no configurado"}), 500
    except Exception as e:
        return jsonify({"status": "error", "mensaje": str(e)}), 500
    
    hoy = datetime.now()
    fecha_consulta = (hoy + timedelta(days=1)).strftime('%Y-%m-%d') if tipo == 'disponibilidad' else hoy.strftime('%Y-%m-%d')
    
    try:
        html = descargar_datos_zaaz(fecha_consulta, cookie)
        filas = extraer_filas_tabla(html)
        
        casos = []
        nuevas = 0
        for f in filas:
            id_caso = f.get('ID') or f.get('OS') or f.get('ID_INTERNO') or ''
            es_adicional = False
            
            if tipo == 'seguimiento':
                if not primera_carga_completada:
                    if id_caso:
                        base_inicial_ids.add(id_caso)
                else:
                    if id_caso and (id_caso not in base_inicial_ids):
                        es_adicional = True
                        nuevas += 1
                        
            f['_esAdicional'] = es_adicional
            casos.append(f)
            
        if tipo == 'seguimiento' and not primera_carga_completada and casos:
            primera_carga_completada = True
            
        return jsonify({
            "status": "ok",
            "tipo": tipo,
            "total": len(casos),
            "nuevas_adicionales": nuevas,
            "datos": casos
        })
    except SesionExpirada as e:
        return jsonify({"status": "error", "codigo": "sesion_expirada", "mensaje": str(e)}), 401
    except Exception as e:
        return jsonify({"status": "error", "mensaje": str(e)}), 500

@app.route('/api/reiniciar-base', methods=['POST'])
def reiniciar_base():
    global base_inicial_ids, primera_carga_completada
    base_inicial_ids.clear()
    primera_carga_completada = False
    return jsonify({"status": "ok", "mensaje": "Base reiniciada"})

# ==================== MAIN ====================
if __name__ == '__main__':
    print()
    print("=" * 60)
    print("🚀 SERVIDOR ZAAZ")
    print("=" * 60)
    print(f"📁 Carpeta: {os.path.abspath('.')}")
    print(f"🍪 Cookie:  {os.path.abspath(ARCHIVO_COOKIE)}")
    print()
    print("🌐 Escuchando en: http://localhost:5000")
    print("=" * 60)
    print()
    app.run(host='0.0.0.0', port=5000, debug=False)