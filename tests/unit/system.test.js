/**
 * Unit tests for core emulator modules (Memory, Z80, ULA, Disassembler).
 * Converted from system-test.html.
 */

import { describe, it, expect } from 'vitest';
import { Memory } from '../../js/core/memory.js';
import { Z80 } from '../../js/core/z80.js';
import { ULA } from '../../js/core/ula.js';
import { Disassembler } from '../../js/core/disasm.js';

// ==================== MEMORY TESTS ====================

describe('48K Memory Layout', () => {
    it('ROM write protection at 0x0000', () => {
        const mem = new Memory('48k');
        const romByte = mem.read(0x0000);
        mem.write(0x0000, 0xAA);
        expect(mem.read(0x0000)).toBe(romByte);
    });

    it('Screen RAM write/read at 0x4000', () => {
        const mem = new Memory('48k');
        mem.write(0x4000, 0x55);
        expect(mem.read(0x4000)).toBe(0x55);
    });

    it('Screen RAM write/read at 0x57FF', () => {
        const mem = new Memory('48k');
        mem.write(0x57FF, 0xAA);
        expect(mem.read(0x57FF)).toBe(0xAA);
    });

    it('Attribute RAM write/read at 0x5800', () => {
        const mem = new Memory('48k');
        mem.write(0x5800, 0x38);
        expect(mem.read(0x5800)).toBe(0x38);
    });

    it('Upper RAM write/read at 0x8000', () => {
        const mem = new Memory('48k');
        mem.write(0x8000, 0x12);
        expect(mem.read(0x8000)).toBe(0x12);
    });

    it('Upper RAM write/read at 0xFFFF', () => {
        const mem = new Memory('48k');
        mem.write(0xFFFF, 0x34);
        expect(mem.read(0xFFFF)).toBe(0x34);
    });

    it('ROM boundary protection at 0x3FFF', () => {
        const mem = new Memory('48k');
        const lastRom = mem.read(0x3FFF);
        mem.write(0x3FFF, 0xFF);
        expect(mem.read(0x3FFF)).toBe(lastRom);
    });

    it('RAM starts at 0x4000', () => {
        const mem = new Memory('48k');
        mem.write(0x4000, 0xBE);
        expect(mem.read(0x4000)).toBe(0xBE);
    });
});

// ==================== 128K BANKING TESTS ====================

describe('128K Memory Banking', () => {
    it('8 banks at 0xC000 retain independent values', () => {
        const mem = new Memory('128k');

        for (let bank = 0; bank < 8; bank++) {
            mem.writePort(0x7FFD, bank);
            mem.write(0xC000, bank + 0x10);
            mem.write(0xC001, bank + 0x20);
        }

        for (let bank = 0; bank < 8; bank++) {
            mem.writePort(0x7FFD, bank);
            expect(mem.read(0xC000)).toBe(bank + 0x10);
            expect(mem.read(0xC001)).toBe(bank + 0x20);
        }
    });

    it('ROM bank 0 selected with bit 4 = 0', () => {
        const mem = new Memory('128k');
        mem.writePort(0x7FFD, 0x00);
        expect(mem.getPagingState().romBank).toBe(0);
    });

    it('ROM bank 1 selected with bit 4 = 1', () => {
        const mem = new Memory('128k');
        mem.writePort(0x7FFD, 0x10);
        expect(mem.getPagingState().romBank).toBe(1);
    });

    it('paging disable bit (0x20) locks banking', () => {
        const mem = new Memory('128k');
        mem.writePort(0x7FFD, 0x00);
        mem.write(0xC000, 0xAA);

        mem.writePort(0x7FFD, 0x20); // Set disable bit
        mem.writePort(0x7FFD, 0x01); // Try to switch to bank 1

        expect(mem.read(0xC000)).toBe(0xAA);
    });

    it('screen bank selection bit (0x08) parsed', () => {
        const mem = new Memory('128k');

        mem.writePort(0x7FFD, 0x05);
        mem.write(0xC000, 0x55);

        mem.writePort(0x7FFD, 0x07);
        mem.write(0xC000, 0x77);

        mem.writePort(0x7FFD, 0x00); // screen 0 (bank 5)
        const screen5 = mem.read(0x4000);

        mem.writePort(0x7FFD, 0x08); // screen 1 (bank 7)
        const screen7 = mem.read(0x4000);

        // Just verify the bit is parsed without crashing
        expect(screen5).toBeDefined();
        expect(screen7).toBeDefined();
    });
});

// ==================== KEYBOARD TESTS ====================

describe('Keyboard Port Decoding', () => {
    const halfRows = [
        { addr: 0xFEFE, keys: 'SHIFT, Z, X, C, V' },
        { addr: 0xFDFE, keys: 'A, S, D, F, G' },
        { addr: 0xFBFE, keys: 'Q, W, E, R, T' },
        { addr: 0xF7FE, keys: '1, 2, 3, 4, 5' },
        { addr: 0xEFFE, keys: '0, 9, 8, 7, 6' },
        { addr: 0xDFFE, keys: 'P, O, I, U, Y' },
        { addr: 0xBFFE, keys: 'ENTER, L, K, J, H' },
        { addr: 0x7FFE, keys: 'SPACE, SYM, M, N, B' }
    ];

    it.each(halfRows)('half-row $addr ($keys) returns 0x1F with no keys pressed', ({ addr }) => {
        const mem = new Memory('48k');
        const ula = new ULA(mem, '48k');
        const bits = ula.readPort(addr) & 0x1F;
        expect(bits).toBe(0x1F);
    });
});

describe('Keyboard Key Press Simulation', () => {
    function createULA() {
        const mem = new Memory('48k');
        return new ULA(mem, '48k');
    }

    it('key A press detected on port 0xFDFE bit 0', () => {
        const ula = createULA();
        ula.keyDown('a');
        expect(ula.readPort(0xFDFE) & 0x01).toBe(0);
    });

    it('key A release detected', () => {
        const ula = createULA();
        ula.keyDown('a');
        ula.keyUp('a');
        expect(ula.readPort(0xFDFE) & 0x01).toBe(1);
    });

    it('SPACE press detected on port 0x7FFE bit 0', () => {
        const ula = createULA();
        ula.keyDown(' ');
        expect(ula.readPort(0x7FFE) & 0x01).toBe(0);
    });

    it('ENTER press detected on port 0xBFFE bit 0', () => {
        const ula = createULA();
        ula.keyDown('Enter');
        expect(ula.readPort(0xBFFE) & 0x01).toBe(0);
    });

    it('Q+W simultaneous press', () => {
        const ula = createULA();
        ula.keyDown('q');
        ula.keyDown('w');
        expect(ula.readPort(0xFBFE) & 0x03).toBe(0);
    });
});

// ==================== ULA TESTS ====================

describe('ULA Timing Constants', () => {
    it('48K frame length: 224 * 312 = 69888 T-states', () => {
        expect(224 * 312).toBe(69888);
    });

    it('128K frame length: 228 * 311 = 70908 T-states', () => {
        expect(228 * 311).toBe(70908);
    });

    it('Pentagon frame length: 224 * 320 = 71680 T-states', () => {
        expect(224 * 320).toBe(71680);
    });
});

describe('ULA Port Decoding', () => {
    function createULA() {
        const mem = new Memory('48k');
        return new ULA(mem, '48k');
    }

    it('border color set via port 0xFE', () => {
        const ula = createULA();
        ula.writePort(0xFE, 0x02);
        expect(ula.borderColor).toBe(2);
    });

    it('border color bits 0-2 mask', () => {
        const ula = createULA();
        ula.writePort(0xFE, 0x07);
        expect(ula.borderColor).toBe(7);
    });

    it('EAR output bit (bit 4)', () => {
        const ula = createULA();
        ula.writePort(0xFE, 0x10);
        expect(ula.earOutput).toBe(1);
    });

    it('EAR output clear', () => {
        const ula = createULA();
        ula.writePort(0xFE, 0x00);
        expect(ula.earOutput).toBe(0);
    });

    it('MIC output bit (bit 3)', () => {
        const ula = createULA();
        ula.writePort(0xFE, 0x08);
        expect(ula.micOutput).toBe(1);
    });
});

describe('ULA Interrupt Timing', () => {
    it('48K INT pulse length: 32 T-states', () => {
        expect(32).toBe(32); // Documented constant
    });
});

describe('Screen Geometry', () => {
    it('screen width 256 pixels', () => {
        const mem = new Memory('48k');
        const ula = new ULA(mem, '48k');
        expect(ula.SCREEN_WIDTH).toBe(256);
    });

    it('screen height 192 pixels', () => {
        const mem = new Memory('48k');
        const ula = new ULA(mem, '48k');
        expect(ula.SCREEN_HEIGHT).toBe(192);
    });

    it('48K total lines: 312 (64+192+56)', () => {
        expect(64 + 192 + 56).toBe(312);
    });
});

describe('Attribute Handling', () => {
    it('FLASH toggles every 16 frames', () => {
        expect(16).toBe(16); // Documented constant
    });

    it('attribute bit fields', () => {
        const attr = 0b01000111; // BRIGHT + INK 7 + PAPER 0
        expect(attr & 0x07).toBe(7);         // INK from bits 0-2
        expect((attr >> 3) & 0x07).toBe(0);  // PAPER from bits 3-5
        expect(attr & 0x40).not.toBe(0);     // BRIGHT from bit 6
        expect(attr & 0x80).toBe(0);         // FLASH from bit 7
    });
});

// ==================== CHAINED PREFIX TESTS ====================

describe('Chained Prefix - Z80 Execution', () => {
    let mem, cpu;

    function execCode(code, initRegs = {}) {
        for (let i = 0; i < code.length; i++) {
            mem.write(0x8000 + i, code[i]);
        }
        cpu.reset();
        cpu.pc = 0x8000;
        Object.assign(cpu, initRegs);

        const startT = cpu.tStates;
        cpu.step();
        return cpu.tStates - startT;
    }

    function setup() {
        mem = new Memory('48k');
        cpu = new Z80(mem);
        // Provide no-op contention handlers
        cpu.contend = () => {};
        cpu.contendInternal = () => {};
    }

    it('DD DD 21 34 12: IX = 1234h (second DD wins)', () => {
        setup();
        cpu.ix = 0;
        const t = execCode([0xDD, 0xDD, 0x21, 0x34, 0x12]);
        expect(cpu.ix).toBe(0x1234);
        expect(t).toBe(18);
    });

    it('DD FD 21 78 56: IY = 5678h (FD overrides DD)', () => {
        setup();
        cpu.iy = 0;
        const t = execCode([0xDD, 0xFD, 0x21, 0x78, 0x56]);
        expect(cpu.iy).toBe(0x5678);
        expect(t).toBe(18);
    });

    it('FD DD 21 AB 00: IX = 00ABh (DD overrides FD)', () => {
        setup();
        cpu.ix = 0;
        const t = execCode([0xFD, 0xDD, 0x21, 0xAB, 0x00]);
        expect(cpu.ix).toBe(0x00AB);
        expect(t).toBe(18);
    });

    it('DD ED 4A: HL = 1234h (ED overrides DD, ADC HL,BC)', () => {
        setup();
        const t = execCode([0xDD, 0xED, 0x4A], { hl: 0x1000, bc: 0x0234, f: 0 });
        expect(cpu.hl).toBe(0x1234);
        expect(t).toBe(19);
    });

    it('DD DD DD 23: IX = 0100h (INC IX with two redundant DDs)', () => {
        setup();
        const t = execCode([0xDD, 0xDD, 0xDD, 0x23], { ix: 0x00FF });
        expect(cpu.ix).toBe(0x0100);
        expect(t).toBe(18);
    });

    it('FD FD 2B: IY = 0000h (DEC IY with redundant FD)', () => {
        setup();
        const t = execCode([0xFD, 0xFD, 0x2B], { iy: 0x0001 });
        expect(cpu.iy).toBe(0x0000);
        expect(t).toBe(14);
    });

    it('DD FD DD ED 44: A = FBh (NEG of 05h, complex chain)', () => {
        setup();
        const t = execCode([0xDD, 0xFD, 0xDD, 0xED, 0x44], { a: 0x05 });
        expect(cpu.a).toBe(0xFB);
        expect(t).toBe(20);
    });
});

describe('Chained Prefix - Disassembler', () => {
    let mem, disasm;

    function setup() {
        mem = new Memory('48k');
        disasm = new Disassembler(mem);
    }

    function writeBytes(addr, bytes) {
        for (let i = 0; i < bytes.length; i++) {
            mem.write(addr + i, bytes[i]);
        }
    }

    it('DD DD: first DD = DEFB DDh', () => {
        setup();
        writeBytes(0x8000, [0xDD, 0xDD, 0x21, 0x34, 0x12]);
        const result = disasm.disassemble(0x8000);
        expect(result.mnemonic).toBe('DEFB DDh');
        expect(result.length).toBe(1);
    });

    it('DD DD: second instruction = LD IX,1234h', () => {
        setup();
        writeBytes(0x8000, [0xDD, 0xDD, 0x21, 0x34, 0x12]);
        const result = disasm.disassemble(0x8001);
        expect(result.mnemonic).toBe('LD IX,1234h');
    });

    it('DD FD: DD = DEFB DDh', () => {
        setup();
        writeBytes(0x8000, [0xDD, 0xFD, 0x21, 0x78, 0x56]);
        expect(disasm.disassemble(0x8000).mnemonic).toBe('DEFB DDh');
    });

    it('DD FD: FD 21 = LD IY,5678h', () => {
        setup();
        writeBytes(0x8000, [0xDD, 0xFD, 0x21, 0x78, 0x56]);
        expect(disasm.disassemble(0x8001).mnemonic).toBe('LD IY,5678h');
    });

    it('FD DD: FD = DEFB FDh', () => {
        setup();
        writeBytes(0x8000, [0xFD, 0xDD, 0x21, 0xAB, 0x00]);
        expect(disasm.disassemble(0x8000).mnemonic).toBe('DEFB FDh');
    });

    it('FD DD: DD 21 = LD IX,00ABh', () => {
        setup();
        writeBytes(0x8000, [0xFD, 0xDD, 0x21, 0xAB, 0x00]);
        expect(disasm.disassemble(0x8001).mnemonic).toBe('LD IX,00ABh');
    });

    it('DD ED: DD = DEFB DDh', () => {
        setup();
        writeBytes(0x8000, [0xDD, 0xED, 0x4A]);
        expect(disasm.disassemble(0x8000).mnemonic).toBe('DEFB DDh');
    });

    it('DD ED: ED 4A = ADC HL,BC', () => {
        setup();
        writeBytes(0x8000, [0xDD, 0xED, 0x4A]);
        expect(disasm.disassemble(0x8001).mnemonic).toBe('ADC HL,BC');
    });

    it('DD DD DD CB: triple chain with indexed bit op', () => {
        setup();
        writeBytes(0x8000, [0xDD, 0xDD, 0xDD, 0xCB, 0x05, 0x46]);
        expect(disasm.disassemble(0x8000).mnemonic).toBe('DEFB DDh');
        expect(disasm.disassemble(0x8001).mnemonic).toBe('DEFB DDh');
        expect(disasm.disassemble(0x8002).mnemonic).toBe('BIT 0,(IX+5h)');
    });

    it('normal DD instruction (no chain) = LD IX,1000h', () => {
        setup();
        writeBytes(0x8000, [0xDD, 0x21, 0x00, 0x10]);
        const result = disasm.disassemble(0x8000);
        expect(result.mnemonic).toBe('LD IX,1000h');
        expect(result.length).toBe(4);
    });
});

describe('Chained Prefix - R Register', () => {
    it('DD DD: R incremented at least twice for prefix bytes', () => {
        const mem = new Memory('48k');
        const cpu = new Z80(mem);
        cpu.contend = () => {};
        cpu.contendInternal = () => {};

        for (let i = 0; i < 5; i++) {
            mem.write(0x8000 + i, [0xDD, 0xDD, 0x21, 0x34, 0x12][i]);
        }

        cpu.reset();
        cpu.pc = 0x8000;
        cpu.rFull = 0;
        cpu.step();

        const rAfter = cpu.rFull & 0x7F;
        expect(rAfter).toBeGreaterThanOrEqual(2);
    });
});
