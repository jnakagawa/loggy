#!/bin/bash

# Log that we were called
echo "[$(date)] Wrapper called with args: $@" >> /Users/jonahnakagawa/vibes/extension-analytics-logger/native-host/wrapper-debug.log
echo "[$(date)] PATH: $PATH" >> /Users/jonahnakagawa/vibes/extension-analytics-logger/native-host/wrapper-debug.log
echo "[$(date)] PWD: $(pwd)" >> /Users/jonahnakagawa/vibes/extension-analytics-logger/native-host/wrapper-debug.log

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Log execution
echo "[$(date)] Executing node script" >> /Users/jonahnakagawa/vibes/extension-analytics-logger/native-host/wrapper-debug.log

exec /opt/homebrew/bin/node "$(dirname "$0")/proxy-host.cjs" 2>> /Users/jonahnakagawa/vibes/extension-analytics-logger/native-host/wrapper-debug.log
