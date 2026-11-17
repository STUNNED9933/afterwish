// Joining the server world (0.55): the same messages as a host's room, over a WebSocket to the
// game server instead of straight to a friend's browser. main.js treats it like JoinRoom.
import { NET_VERSION } from './sync.js';

export class ServerRoom {
  constructor({ onMessage, onClose }) {
    Object.assign(this, { onMessage, onClose });
    this.ws = null;
    this.pid = null;
    this.closed = false;
    this.server = true;
  }

  /** Connect to `url` (wss://...) and say hello. Resolves with the welcome, or rejects with a reason. */
  join(url, hello) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (why) => {
        if (done) return;
        done = true;
        try {
          this.ws && this.ws.close();
        } catch (err) {
          /* already closed */
        }
        reject(new Error(why));
      };
      let ws;
      try {
        ws = this.ws = new WebSocket(url);
      } catch (err) {
        return fail('That server address does not look right.');
      }
      const timer = setTimeout(() => fail('The server did not answer. Check the address, or try again in a minute.'), 12000);
      ws.onopen = () => ws.send(JSON.stringify(Object.assign({ t: 'hello', v: NET_VERSION }, hello)));
      ws.onmessage = (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch (err) {
          return;
        }
        if (!msg || typeof msg !== 'object') return;
        if (!done) {
          if (msg.t === 'welcome') {
            done = true;
            clearTimeout(timer);
            this.pid = msg.pid;
            resolve(msg);
          } else if (msg.t === 'reject') {
            clearTimeout(timer);
            fail(msg.reason);
          }
          return;
        }
        this.onMessage(msg);
      };
      ws.onerror = () => {
        if (!done) {
          clearTimeout(timer);
          fail('Could not reach the server world. It may be down, or the address is wrong.');
        }
      };
      ws.onclose = (e) => {
        clearTimeout(timer);
        if (!done) fail(e.reason || 'The server closed the connection.');
        else if (!this.closed) this.onClose(e.reason || 'The connection to the server world was lost.');
      };
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closed = true;
    this.send({ t: 'bye' });
    setTimeout(() => {
      try {
        this.ws && this.ws.close(1000);
      } catch (err) {
        /* already closed */
      }
    }, 200);
  }
}
