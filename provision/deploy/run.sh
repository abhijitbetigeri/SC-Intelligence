#!/bin/sh
# Launch the hosted instance with cwd = this directory, so persist.js writes deploy/.data and
# dotenv reads deploy/.env — isolated from the dev instance's state.
cd "$(dirname "$0")" && exec node ../server/index.js
