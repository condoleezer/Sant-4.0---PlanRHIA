"""
Routeur proxy pour l'interface Hublo
Permet d'afficher Hublo dans un iframe en contournant X-Frame-Options
"""
from fastapi import APIRouter, Request, Response, HTTPException
from urllib.parse import urljoin, urlparse
import re
import requests
import asyncio
import gzip
import zlib

router = APIRouter(prefix="/hublo", tags=["hublo-proxy"])

# URL de base de Hublo
HUBLO_BASE_URL = "https://ng.hublo.com"

# Headers à retirer de la réponse Hublo
HEADERS_TO_REMOVE = [
    "x-frame-options",
    "content-security-policy",
    "frame-options",
]

# Headers à conserver
HEADERS_TO_KEEP = [
    "content-type",
    "content-length",
    "cache-control",
    "expires",
]


def rewrite_urls(content: str, base_path: str) -> str:
    """
    Réécrit les URLs dans le contenu HTML pour pointer vers notre proxy
    """
    hublo_domain = urlparse(HUBLO_BASE_URL).netloc
    
    # Remplacer les URLs absolues de Hublo par des URLs via notre proxy
    def replace_absolute_url(match):
        full_url = match.group(0)
        return full_url.replace(f'https://{hublo_domain}', '/hublo').replace(f'http://{hublo_domain}', '/hublo')
    
    content = re.sub(
        rf'https?://{re.escape(hublo_domain)}[^\s"\'<>\)]*',
        replace_absolute_url,
        content,
        flags=re.IGNORECASE
    )
    
    # Remplacer les URLs relatives qui commencent par /
    # Pattern amélioré pour capturer correctement les attributs HTML
    def replace_attr_url(match):
        attr_name = match.group(1)  # href, src, action, etc.
        quote_start = match.group(2)  # " ou '
        url = match.group(3)  # L'URL
        quote_end = match.group(4)  # " ou '
        
        # Ne pas modifier si :
        # - URL commence par // (protocole relatif)
        # - URL commence par http:// ou https:// (URL absolue externe)
        # - URL commence déjà par /hublo
        # - URL commence par # (ancre)
        # - URL commence par javascript: ou data:
        if (url.startswith('//') or 
            url.startswith('http://') or url.startswith('https://') or
            url.startswith('/hublo') or 
            url.startswith('#') or
            url.startswith('javascript:') or url.startswith('data:')):
            return match.group(0)
        
        # Si l'URL commence par /, ajouter /hublo devant
        if url.startswith('/'):
            new_url = f'/hublo{url}'
            return f'{attr_name}={quote_start}{new_url}{quote_end}'
        
        return match.group(0)
    
    # Patterns pour différents types d'URLs dans HTML
    # Pattern amélioré pour capturer href="/path", src="/path", etc.
    patterns = [
        (r'(href|src|action)=(["\'])([^"\']+)(["\'])', replace_attr_url),
        # Pour les URLs dans les CSS (url(...))
        (r'url\((["\']?)([^"\'()]+)(["\']?)\)', lambda m: f'url({m.group(1)}{"/hublo" + m.group(2) if m.group(2).startswith("/") and not m.group(2).startswith("/hublo") else m.group(2)}{m.group(3)})'),
    ]
    
    for pattern, replacer in patterns:
        content = re.sub(pattern, replacer, content)
    
    return content


@router.get("/{path:path}")
async def proxy_hublo(path: str, request: Request):
    """
    Proxy pour toutes les routes Hublo
    Récupère le contenu depuis Hublo et le sert via notre API
    """
    return await _proxy_request(path, request)


@router.post("/{path:path}")
async def proxy_hublo_post(path: str, request: Request):
    """Proxy POST pour Hublo"""
    return await _proxy_request(path, request)


@router.put("/{path:path}")
async def proxy_hublo_put(path: str, request: Request):
    """Proxy PUT pour Hublo"""
    return await _proxy_request(path, request)


@router.delete("/{path:path}")
async def proxy_hublo_delete(path: str, request: Request):
    """Proxy DELETE pour Hublo"""
    return await _proxy_request(path, request)


async def _proxy_request(path: str, request: Request):
    """
    Fonction interne pour gérer les requêtes proxy
    """
    try:
        # Construire l'URL complète vers Hublo
        hublo_url = urljoin(HUBLO_BASE_URL, path)
        
        # Ajouter les paramètres de requête s'ils existent
        if request.url.query:
            hublo_url = f"{hublo_url}?{request.url.query}"
        
        print(f"[HUBLO PROXY] Proxying request to: {hublo_url}")
        
        # Préparer les headers pour la requête vers Hublo
        headers = {}
        
        # Transférer certains headers de la requête originale
        headers_to_forward = ["user-agent", "accept-language", "cookie", "referer", "content-type"]
        for header_name in headers_to_forward:
            if header_name in request.headers:
                headers[header_name] = request.headers[header_name]
        
        # Ne pas accepter la compression pour simplifier le traitement
        headers["accept-encoding"] = "identity"
        
        # Faire la requête vers Hublo de manière asynchrone
        method = request.method.lower()
        body = await request.body() if method in ["post", "put"] else None
        
        def make_request():
            if method == "get":
                return requests.get(hublo_url, headers=headers, timeout=30, allow_redirects=True)
            elif method == "post":
                return requests.post(hublo_url, headers=headers, data=body, timeout=30, allow_redirects=True)
            elif method == "put":
                return requests.put(hublo_url, headers=headers, data=body, timeout=30, allow_redirects=True)
            elif method == "delete":
                return requests.delete(hublo_url, headers=headers, timeout=30, allow_redirects=True)
            else:
                return requests.request(method, hublo_url, headers=headers, data=body, timeout=30, allow_redirects=True)
        
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, make_request)
        
        # Récupérer le contenu et gérer la décompression
        response_headers_dict = dict(response.headers)
        content_encoding = response_headers_dict.get("content-encoding", "").lower()
        
        # Décompresser le contenu si nécessaire
        if content_encoding == "gzip":
            try:
                content = gzip.decompress(response.content)
                print(f"[HUBLO PROXY] Content decompressed from gzip")
            except Exception as e:
                print(f"[HUBLO PROXY] Error decompressing gzip: {e}, using raw content")
                content = response.content
        elif content_encoding == "deflate":
            try:
                content = zlib.decompress(response.content)
                print(f"[HUBLO PROXY] Content decompressed from deflate")
            except Exception as e:
                print(f"[HUBLO PROXY] Error decompressing deflate: {e}, using raw content")
                content = response.content
        else:
            content = response.content
        
        content_type = response_headers_dict.get("content-type", "text/html")
        
        print(f"[HUBLO PROXY] Response status: {response.status_code}, Content-Type: {content_type}, Content length: {len(content)}")
        
        # Si c'est du HTML, réécrire les URLs pour que toutes les ressources passent par le proxy
        if "text/html" in content_type:
            try:
                content_str = content.decode("utf-8", errors='ignore')
                print(f"[HUBLO PROXY] HTML content received (length: {len(content_str)}), rewriting URLs...")
                content_str = rewrite_urls(content_str, path)
                print(f"[HUBLO PROXY] URLs rewritten successfully")
                content = content_str.encode("utf-8")
            except Exception as e:
                print(f"[HUBLO PROXY] Erreur lors du traitement du HTML: {e}")
                import traceback
                traceback.print_exc()
        
        # Préparer les headers de réponse
        response_headers = {}
        
        # Copier les headers utiles
        for header_name, header_value in response_headers_dict.items():
            header_lower = header_name.lower()
            # Retirer les headers qui bloquent l'iframe
            if header_lower not in HEADERS_TO_REMOVE:
                # Ne pas copier content-encoding car on a déjà décompressé
                if header_lower == "content-encoding":
                    continue
                if header_lower in HEADERS_TO_KEEP or header_lower.startswith("content-"):
                    # Mettre à jour content-length après décompression
                    if header_lower == "content-length":
                        response_headers[header_name] = str(len(content))
                    else:
                        response_headers[header_name] = header_value
        
        # Retirer complètement les headers qui bloquent l'iframe (ne pas les remplacer)
        # Ne pas ajouter X-Frame-Options car certains navigateurs ne reconnaissent pas ALLOWALL
        # Ne pas ajouter de CSP restrictif
        
        print(f"[HUBLO PROXY] Response headers prepared: {len(response_headers)} headers")
        
        # Retourner la réponse
        return Response(
            content=content,
            status_code=response.status_code,
            headers=response_headers,
            media_type=content_type
        )
        
    except requests.Timeout:
        raise HTTPException(status_code=504, detail="Timeout lors de la connexion à Hublo")
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Erreur de connexion à Hublo: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur du proxy: {str(e)}")
