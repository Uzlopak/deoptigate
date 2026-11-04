'use strict'

/** @file Register a direct process exit handler for SIGINT. */
process.on('SIGINT', () => process.exit(0))
