const net = require('net');

const originalListen = net.Server.prototype.listen;
const defaultHost = process.env.DETOX_SERVER_HOST || '127.0.0.1';

net.Server.prototype.listen = function patchedListen(...args) {
  if (typeof args[0] === 'number') {
    return originalListen.call(this, { port: args[0], host: defaultHost }, ...args.slice(1));
  }

  if (args[0] && typeof args[0] === 'object' && args[0].port && !args[0].host) {
    return originalListen.call(this, { ...args[0], host: defaultHost }, ...args.slice(1));
  }

  return originalListen.apply(this, args);
};
