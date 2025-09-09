import { ReadlineParser, SerialPort } from 'serialport';

export interface ClassifiedLine {
  idx: number;      // monotonically increasing index
  ts: string;       // ISO timestamp
  raw: string;      // raw line text (no trailing newline)
  type?: string;    // optional classification (ACK, NOK, AP_EVT, UNKNOWN, etc.)
}

interface SerialState {
  portPath?: string;
  isOpen: boolean;
  lastOpenTime?: number;
  lastActivity?: number;
  baudRate: number;
  nextIndex: number; // next index to assign (also length of full log)
}

class SerialManager {
  private static _instance: SerialManager;
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private logBuffer: ClassifiedLine[] = [];
  private maxLog = 500;
  private state: SerialState = { isOpen:false, baudRate:115200, nextIndex:0 };

  static instance(){
    if(!this._instance) this._instance = new SerialManager();
    return this._instance;
  }

  getState(){ return { ...this.state }; }

  // Retrieve log lines.
  // Params:
  //  sinceIdx: return only lines with idx >= sinceIdx
  //  tail: if provided (and sinceIdx undefined) return last N lines
  getLog(params?: { sinceIdx?: number; tail?: number }): ClassifiedLine[] {
    if(!params) return this.logBuffer.slice();
    const { sinceIdx, tail } = params;
    if(sinceIdx !== undefined){
      return this.logBuffer.filter(l=> l.idx >= sinceIdx);
    }
    if(tail !== undefined){
      return this.logBuffer.slice(-tail);
    }
    return this.logBuffer.slice();
  }

  async listPorts(){
    return SerialPort.list();
  }

  async open(path:string, baudRate=115200){
    if(this.port && this.port.isOpen){
      if(this.state.portPath === path && this.state.baudRate === baudRate) return this.state; // already open
      await this.close();
    }
    return new Promise<SerialState>((resolve,reject)=>{
      try {
        this.port = new SerialPort({ path, baudRate }, (err)=>{
          if(err){
            this.port = null; return reject(err);
          }
        });
        this.state = { portPath:path, isOpen:true, baudRate, lastOpenTime:Date.now(), lastActivity:Date.now(), nextIndex:0 };
        this.parser = this.port.pipe(new ReadlineParser({ delimiter:'\n' }));
        this.parser.on('data', line=>{
          const ts = new Date().toISOString();
          const clean = line.replace(/\r$/,'');
          const classified: ClassifiedLine = { idx: this.state.nextIndex++, ts, raw: clean, type: classifyLine(clean) };
          this.logBuffer.push(classified);
          if(this.logBuffer.length>this.maxLog) this.logBuffer.splice(0, this.logBuffer.length - this.maxLog);
          this.state.lastActivity = Date.now();
        });
        this.port.on('error', err=>{
          const ts = new Date().toISOString();
          const classified: ClassifiedLine = { idx: this.state.nextIndex++, ts, raw: `<error> ${err.message}`, type: 'ERROR' };
          this.logBuffer.push(classified);
        });
        this.port.on('close', ()=>{
          this.state.isOpen = false;
        });
        // Wait a brief moment to ensure open
        setTimeout(()=> resolve(this.getState()), 100);
      } catch(e){ reject(e); }
    });
  }

  async close(){
    if(!this.port) return;
    await new Promise<void>((resolve)=>{
      this.port!.close(()=>resolve());
    });
    this.port = null; this.parser = null; this.state.isOpen = false; this.state.portPath = undefined; this.state.nextIndex = 0; this.logBuffer = [];
  }

  async write(data:string){
    if(!this.port || !this.port.isOpen) throw new Error('Port not open');
    return new Promise<void>((resolve,reject)=>{
      this.port!.write(data, err=>{
        if(err) return reject(err);
        this.port!.drain(()=>{
          this.state.lastActivity = Date.now();
          resolve();
        });
      });
    });
  }

  async writeLine(line:string){
    await this.write(line.endsWith('\n')? line: line+'\n');
  }

  // Execute a CLI command and collect output lines until next prompt (or timeout)
  async execCli(command:string, timeoutMs=1500){
    if(!this.port || !this.port.isOpen) throw new Error('Port not open');
    const startIdx = this.state.nextIndex; // index that will be first after we send command
    await this.writeLine(command);
    const startTime = Date.now();
    return new Promise<{command:string; lines: ClassifiedLine[]; elapsedMs:number; timedOut:boolean}>(resolve=>{
      const check = () => {
        const now = Date.now();
        const newLines = this.getLog({ sinceIdx: startIdx });
        // Stop when we see a PROMPT line following other lines
        const hasPromptAfter = newLines.some(l=> l.type === 'PROMPT' && l.idx > startIdx);
        const timeout = now - startTime >= timeoutMs;
        if(hasPromptAfter || timeout){
          resolve({ command, lines: newLines, elapsedMs: now-startTime, timedOut: timeout && !hasPromptAfter });
        } else {
          setTimeout(check, 50);
        }
      };
      setTimeout(check, 60);
    });
  }
}

export const serialManager = SerialManager.instance();

// --- Classification Helpers ---
const ACK_PATTERNS = ['ACK>', 'NOK>', 'NOQ>'];
function classifyLine(line:string): string | undefined {
  if(!line) return undefined;
  if(ACK_PATTERNS.some(p=> line.startsWith(p))) return line.substring(0,3) === 'ACK'? 'ACK' : (line.startsWith('NOK')? 'NOK':'NOQ');
  if(line.startsWith('>')) return 'PROMPT';
  if(/Unknown command:/.test(line)) return 'CLI_UNKNOWN';
  if(line.includes('sysinfo')) return 'CLI_SYSINFO';
  if(line.includes('tasks')) return 'CLI_TASKS';
  if(/Sendblock complete/.test(line)) return 'AP_BLOCK_DONE';
  if(/block send failed/.test(line)) return 'AP_BLOCK_FAIL';
  return undefined;
}

// Environment guard utility
export function ensureSerialApiEnabled(){
  if(process.env.ENABLE_SERIAL_API === 'false') throw new Error('Serial API disabled by ENABLE_SERIAL_API');
}
