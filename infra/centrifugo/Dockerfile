# Centrifugo for a hosted deployment (Render builds this; see render.yaml).
# The channel setup matches config.json used in development. Secrets and the allowed origin come
# from environment variables, which Centrifugo reads on top of the file:
#   CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY  same value as the API's CENTRIFUGO_TOKEN_SECRET
#   CENTRIFUGO_HTTP_API_KEY                  same value as the API's CENTRIFUGO_API_KEY
#   CENTRIFUGO_CLIENT_ALLOWED_ORIGINS        the web app's address, e.g. https://campusverse-web.onrender.com
#   CENTRIFUGO_HTTP_SERVER_PORT              the port Render routes to (10000)
FROM centrifugo/centrifugo:v6.10.2
COPY config.prod.json /centrifugo/config.json
CMD ["centrifugo", "--config", "/centrifugo/config.json"]
