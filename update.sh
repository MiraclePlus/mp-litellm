#kill -USR2 $(pgrep -a -f "gunicorn" | head -n 1)
#kill -USR2 $(cat ./gunicorn.pid)
kill -HUP $(cat ./gunicorn.pid)