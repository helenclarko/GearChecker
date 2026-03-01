@echo off
echo "------------------------------------------------------------------------------------------------" >> start_log.txt
echo Started: %DATE% %TIME% >> start_log.txt

pm2 start ecosystem.config.js >> start_log.txt