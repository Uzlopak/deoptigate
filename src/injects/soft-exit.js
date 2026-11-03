'use strict'

/** @file Installs a clean exit handler for Ctrl+C in child processes. */
process.on('SIGINT', () => process.exit(0))
