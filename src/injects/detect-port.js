'use strict'

const net = require('net')
const clinicPort = Number(process.env.CLINIC_DEOPTIGATE_PORT)

if (Number.isInteger(clinicPort) && clinicPort > 0) {
  const listen = net.Server.prototype.listen
  let reported = false

  /**
   * @this {import('net').Server}
   * @returns {import('net').Server}
   */
  net.Server.prototype.listen = function () {
    const server = this
    const result = Reflect.apply(listen, server, arguments)
    server.once('listening', () => {
      if (reported) return
      const address = server.address()
      if (address == null || typeof address === 'string') return

      reported = true
      const client = net.createConnection({ host: '127.0.0.1', port: clinicPort }, () => {
        client.end(String(address.port))
      })
      client.on('error', () => {})
    })
    return result
  }
}
