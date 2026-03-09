/**
 * Z80 Assembler (sjasmplus-js) tests.
 * Converted from asm-test.html.
 */

import { describe, it, expect } from 'vitest';
import { Assembler } from '../../js/sjasmplus/assembler.js';

function asm(source) {
    return Assembler.assemble(source);
}

function bytes(source) {
    const result = asm(source);
    return result.success ? result.output : null;
}

function expectBytes(source, expected, msg) {
    const actual = bytes(source);
    const actualHex = actual ? Array.from(actual).map(b => b.toString(16).padStart(2, '0')).join(' ') : 'null';
    const expectedHex = expected.map(b => b.toString(16).padStart(2, '0')).join(' ');
    expect(actualHex, msg).toBe(expectedHex);
}

// ==================== INSTRUCTION TESTS ====================

describe('LD 8-bit Instructions', () => {
    it.each([
        ['LD A, B', [0x78]],
        ['LD B, C', [0x41]],
        ['LD (HL), A', [0x77]],
        ['LD A, (HL)', [0x7E]],
        ['LD A, 42', [0x3E, 42]],
        ['LD B, $FF', [0x06, 0xFF]],
        ['LD (HL), 123', [0x36, 123]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('LD 16-bit Instructions', () => {
    it.each([
        ['LD BC, $1234', [0x01, 0x34, 0x12]],
        ['LD HL, $4000', [0x21, 0x00, 0x40]],
        ['LD SP, $FFFF', [0x31, 0xFF, 0xFF]],
        ['LD IX, $1234', [0xDD, 0x21, 0x34, 0x12]],
        ['LD IY, $5678', [0xFD, 0x21, 0x78, 0x56]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('LD Indirect Instructions', () => {
    it.each([
        ['LD (BC), A', [0x02]],
        ['LD (DE), A', [0x12]],
        ['LD A, (BC)', [0x0A]],
        ['LD A, (DE)', [0x1A]],
        ['LD ($4000), A', [0x32, 0x00, 0x40]],
        ['LD A, ($4000)', [0x3A, 0x00, 0x40]],
        ['LD ($5000), HL', [0x22, 0x00, 0x50]],
        ['LD HL, ($5000)', [0x2A, 0x00, 0x50]],
        ['LD SP, HL', [0xF9]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('LD Indexed Instructions', () => {
    it.each([
        ['LD (IX+5), A', [0xDD, 0x77, 0x05]],
        ['LD (IY-3), B', [0xFD, 0x70, 0xFD]],
        ['LD A, (IX+10)', [0xDD, 0x7E, 0x0A]],
        ['LD C, (IY+0)', [0xFD, 0x4E, 0x00]],
        ['LD (IX+2), 99', [0xDD, 0x36, 0x02, 99]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('LD Special Registers', () => {
    it.each([
        ['LD A, I', [0xED, 0x57]],
        ['LD A, R', [0xED, 0x5F]],
        ['LD I, A', [0xED, 0x47]],
        ['LD R, A', [0xED, 0x4F]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('ALU 8-bit Instructions', () => {
    it.each([
        ['ADD A, B', [0x80]],
        ['ADD A, (HL)', [0x86]],
        ['ADD A, 10', [0xC6, 10]],
        ['SUB B', [0x90]],
        ['SUB 5', [0xD6, 5]],
        ['AND C', [0xA1]],
        ['XOR A', [0xAF]],
        ['OR (HL)', [0xB6]],
        ['CP $FF', [0xFE, 0xFF]],
        ['ADC A, (IX+5)', [0xDD, 0x8E, 0x05]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('ALU 16-bit Instructions', () => {
    it.each([
        ['ADD HL, BC', [0x09]],
        ['ADD HL, HL', [0x29]],
        ['ADD HL, SP', [0x39]],
        ['ADC HL, DE', [0xED, 0x5A]],
        ['SBC HL, BC', [0xED, 0x42]],
        ['ADD IX, BC', [0xDD, 0x09]],
        ['ADD IY, IY', [0xFD, 0x29]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('INC/DEC Instructions', () => {
    it.each([
        ['INC B', [0x04]],
        ['INC (HL)', [0x34]],
        ['DEC A', [0x3D]],
        ['INC BC', [0x03]],
        ['DEC SP', [0x3B]],
        ['INC IX', [0xDD, 0x23]],
        ['DEC (IX+3)', [0xDD, 0x35, 0x03]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Jump Instructions', () => {
    it.each([
        ['JP $8000', [0xC3, 0x00, 0x80]],
        ['JP NZ, $9000', [0xC2, 0x00, 0x90]],
        ['JP Z, $A000', [0xCA, 0x00, 0xA0]],
        ['JP (HL)', [0xE9]],
        ['JP (IX)', [0xDD, 0xE9]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });

    it.each([
        ['ORG $8000\nJR $8010', [0x18, 0x0E], 'JR forward'],
        ['ORG $8000\nJR $7FF0', [0x18, 0xEE], 'JR backward'],
        ['ORG $8000\nJR NZ, $8005', [0x20, 0x03], 'JR NZ, forward'],
        ['ORG $8010\nDJNZ $8000', [0x10, 0xEE], 'DJNZ backward'],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Call/Return Instructions', () => {
    it.each([
        ['CALL $1234', [0xCD, 0x34, 0x12]],
        ['CALL NZ, $5678', [0xC4, 0x78, 0x56]],
        ['RET', [0xC9]],
        ['RET Z', [0xC8]],
        ['RET NC', [0xD0]],
        ['RST $38', [0xFF]],
        ['RST $00', [0xC7]],
        ['RST $10', [0xD7]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Stack Instructions', () => {
    it.each([
        ['PUSH BC', [0xC5]],
        ['PUSH AF', [0xF5]],
        ['POP HL', [0xE1]],
        ['PUSH IX', [0xDD, 0xE5]],
        ['POP IY', [0xFD, 0xE1]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Exchange Instructions', () => {
    it.each([
        ['EX DE, HL', [0xEB]],
        ["EX AF, AF'", [0x08]],
        ['EX (SP), HL', [0xE3]],
        ['EX (SP), IX', [0xDD, 0xE3]],
        ['EXX', [0xD9]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Rotate/Shift Instructions', () => {
    it.each([
        ['RLCA', [0x07]],
        ['RRCA', [0x0F]],
        ['RLA', [0x17]],
        ['RRA', [0x1F]],
        ['RLC B', [0xCB, 0x00]],
        ['RRC C', [0xCB, 0x09]],
        ['RL (HL)', [0xCB, 0x16]],
        ['SLA A', [0xCB, 0x27]],
        ['SRA B', [0xCB, 0x28]],
        ['SRL C', [0xCB, 0x39]],
        ['SLL A', [0xCB, 0x37]],
        ['RLC (IX+5)', [0xDD, 0xCB, 0x05, 0x06]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Bit Instructions', () => {
    it.each([
        ['BIT 0, A', [0xCB, 0x47]],
        ['BIT 7, (HL)', [0xCB, 0x7E]],
        ['SET 3, B', [0xCB, 0xD8]],
        ['RES 5, C', [0xCB, 0xA9]],
        ['BIT 2, (IX+3)', [0xDD, 0xCB, 0x03, 0x56]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('I/O Instructions', () => {
    it.each([
        ['IN A, ($FE)', [0xDB, 0xFE]],
        ['IN B, (C)', [0xED, 0x40]],
        ['OUT ($FE), A', [0xD3, 0xFE]],
        ['OUT (C), D', [0xED, 0x51]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Miscellaneous Instructions', () => {
    it.each([
        ['NOP', [0x00]],
        ['HALT', [0x76]],
        ['DI', [0xF3]],
        ['EI', [0xFB]],
        ['CPL', [0x2F]],
        ['NEG', [0xED, 0x44]],
        ['SCF', [0x37]],
        ['CCF', [0x3F]],
        ['DAA', [0x27]],
        ['IM 0', [0xED, 0x46]],
        ['IM 1', [0xED, 0x56]],
        ['IM 2', [0xED, 0x5E]],
        ['RETI', [0xED, 0x4D]],
        ['RETN', [0xED, 0x45]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Block Instructions', () => {
    it.each([
        ['LDI', [0xED, 0xA0]],
        ['LDIR', [0xED, 0xB0]],
        ['LDD', [0xED, 0xA8]],
        ['LDDR', [0xED, 0xB8]],
        ['CPI', [0xED, 0xA1]],
        ['CPIR', [0xED, 0xB1]],
        ['INI', [0xED, 0xA2]],
        ['OUTI', [0xED, 0xA3]],
        ['OTIR', [0xED, 0xB3]],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

// ==================== DIRECTIVE TESTS ====================

describe('ORG Directive', () => {
    it('sets start address', () => {
        const result = asm('ORG $8000\nNOP');
        expect(result.outputStart).toBe(0x8000);
    });

    it('multiple ORGs - first is start', () => {
        const result = asm('ORG $8000\nNOP\nORG $8100\nNOP');
        expect(result.outputStart).toBe(0x8000);
    });

    it('multiple ORGs - gap filled', () => {
        const result = asm('ORG $8000\nNOP\nORG $8100\nNOP');
        expect(result.output.length).toBe(257);
    });
});

describe('EQU Directive', () => {
    it('constant', () => {
        expectBytes('SCREEN EQU $4000\nLD HL, SCREEN', [0x21, 0x00, 0x40]);
    });

    it('with expression', () => {
        expectBytes('BASE EQU $4000\nOFFSET EQU 256\nLD HL, BASE + OFFSET', [0x21, 0x00, 0x41]);
    });
});

describe('DB/DEFB Directive', () => {
    it.each([
        ['DB 42', [42], 'single byte'],
        ['DB 1, 2, 3', [1, 2, 3], 'multiple bytes'],
        ['DB "ABC"', [65, 66, 67], 'string'],
        ['DB "Hi", 13, 10, 0', [72, 105, 13, 10, 0], 'mixed'],
        ['DEFB 1, 2', [1, 2], 'DEFB alias'],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('DW/DEFW Directive', () => {
    it.each([
        ['DW $1234', [0x34, 0x12], 'single word'],
        ['DW $1234, $5678', [0x34, 0x12, 0x78, 0x56], 'multiple words'],
        ['ORG $8000\nDW target\ntarget:', [0x02, 0x80], 'with label'],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('DS/DEFS Directive', () => {
    it('reserve space', () => {
        expect(bytes('DS 5').length).toBe(5);
    });

    it('with fill', () => {
        expectBytes('DS 3, $FF', [0xFF, 0xFF, 0xFF]);
    });
});

describe('DZ Directive', () => {
    it('zero-terminated string', () => {
        expectBytes('DZ "Hi"', [72, 105, 0]);
    });
});

describe('DC Directive', () => {
    it('high-bit terminated', () => {
        expectBytes('DC "ABC"', [0x41, 0x42, 0xC3]);
    });

    it('single char', () => {
        expectBytes('DC "X"', [0xD8]);
    });
});

describe('ALIGN Directive', () => {
    it('pads correctly', () => {
        const result = bytes('ORG $8001\nDB 1\nALIGN 4\nDB 2');
        expect(result.length).toBe(4);
        expect(result[0]).toBe(1);
        expect(result[3]).toBe(2);
    });

    it('with fill byte', () => {
        const result = bytes('ORG $8001\nDB 1\nALIGN 4, $FF\nDB 2');
        expect(result[1]).toBe(0xFF);
    });
});

describe('$ Current Address', () => {
    it('in expression', () => {
        expectBytes('ORG $8000\nLD HL, $', [0x21, 0x00, 0x80]);
    });

    it('$ + offset', () => {
        expectBytes('ORG $8000\nJP $ + 10', [0xC3, 0x0A, 0x80]);
    });
});

describe('ASSERT Directive', () => {
    it('true passes', () => {
        expect(asm('ASSERT 1').success).toBe(true);
    });

    it('with expression', () => {
        expect(asm('VAL EQU 5\nASSERT VAL > 3').success).toBe(true);
    });
});

// ==================== LABEL TESTS ====================

describe('Basic Labels', () => {
    it('label at address', () => {
        const result = asm('ORG $8000\nstart:\nNOP');
        const sym = result.symbols.find(s => s.name === 'start');
        expect(sym?.value).toBe(0x8000);
    });

    it('forward reference', () => {
        expectBytes('ORG $8000\nJP forward\nforward:\nNOP', [0xC3, 0x03, 0x80, 0x00]);
    });

    it('backward reference', () => {
        expectBytes('ORG $8000\nstart:\nJP start', [0xC3, 0x00, 0x80]);
    });
});

describe('JR with Labels', () => {
    it('JR forward', () => {
        const result = bytes('ORG $8000\nJR skip\nNOP\nNOP\nskip:\nNOP');
        expect(result[0]).toBe(0x18);
        expect(result[1]).toBe(0x02);
    });

    it('JR backward', () => {
        const result = bytes('ORG $8000\nloop:\nNOP\nJR loop');
        expect(result[0]).toBe(0x00);
        expect(result[1]).toBe(0x18);
        expect(result[2]).toBe(0xFD);
    });
});

describe('Label Without Colon', () => {
    it('before instruction', () => {
        const result = asm('ORG $8000\nmylabel NOP');
        const sym = result.symbols.find(s => s.name === 'mylabel');
        expect(sym?.value).toBe(0x8000);
    });

    it('standalone', () => {
        const result = asm('ORG $8000\nmylabel\nNOP');
        const sym = result.symbols.find(s => s.name === 'mylabel');
        expect(sym?.value).toBe(0x8000);
    });

    it('forward ref', () => {
        expectBytes('ORG $8000\nJP target\ntarget\nRET', [0xC3, 0x03, 0x80, 0xC9]);
    });
});

describe('Local Labels', () => {
    it('same name in different scopes', () => {
        const result = bytes(`
            ORG $8000
            func1:
            .loop:
                NOP
                JR .loop
            func2:
            .loop:
                NOP
                JR .loop
        `);
        expect(result.length).toBe(6);
    });
});

describe('Temporary Labels', () => {
    it('forward reference (1F)', () => {
        const result = bytes('ORG $8000\n1: NOP\nJR 1F\nNOP\n1: NOP');
        expect(result[0]).toBe(0x00);
        expect(result[1]).toBe(0x18);
        expect(result[2]).toBe(0x01);
    });

    it('backward reference (1B)', () => {
        const result = bytes('ORG $8000\n1: NOP\nJR 1B');
        expect(result[0]).toBe(0x00);
        expect(result[1]).toBe(0x18);
        expect(result[2]).toBe(0xFD);
    });

    it('multi-digit forward (10F)', () => {
        const result = bytes('ORG $8000\nJR 10F\nNOP\n10: NOP');
        expect(result[0]).toBe(0x18);
        expect(result[1]).toBe(0x01);
    });

    it('multi-digit backward (10B)', () => {
        const result = bytes('ORG $8000\n10: NOP\nJR 10B');
        expect(result[0]).toBe(0x00);
        expect(result[1]).toBe(0x18);
        expect(result[2]).toBe(0xFD);
    });
});

// ==================== EXPRESSION TESTS ====================

describe('Arithmetic Expressions', () => {
    it.each([
        ['DB 2 + 3', [5], 'Addition'],
        ['DB 10 - 3', [7], 'Subtraction'],
        ['DB 4 * 5', [20], 'Multiplication'],
        ['DB 20 / 4', [5], 'Division'],
        ['DB 17 % 5', [2], 'Modulo'],
        ['DB -5 & 255', [251], 'Negative value'],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Bitwise Expressions', () => {
    it.each([
        ['DB $F0 & $0F', [0], 'AND'],
        ['DB $F0 | $0F', [0xFF], 'OR'],
        ['DB $FF ^ $0F', [0xF0], 'XOR'],
        ['DB ~$00 & $FF', [0xFF], 'NOT'],
        ['DB 1 << 4', [16], 'Shift left'],
        ['DB $80 >> 4', [8], 'Shift right'],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Comparison Expressions', () => {
    it.each([
        ['DB 5 > 3', [1], 'Greater than (true)'],
        ['DB 3 > 5', [0], 'Greater than (false)'],
        ['DB 5 < 3', [0], 'Less than (false)'],
        ['DB 3 < 5', [1], 'Less than (true)'],
        ['DB 5 == 5', [1], 'Equal (true)'],
        ['DB 5 != 3', [1], 'Not equal (true)'],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Logical Expressions', () => {
    it.each([
        ['DB 1 && 1', [1], 'AND (true)'],
        ['DB 1 && 0', [0], 'AND (false)'],
        ['DB 0 || 1', [1], 'OR (true)'],
        ['DB !0', [1], 'NOT'],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Parentheses and Precedence', () => {
    it('operator precedence', () => {
        expectBytes('DB 2 + 3 * 4', [14]);
    });

    it('parentheses', () => {
        expectBytes('DB (2 + 3) * 4', [20]);
    });
});

describe('Number Formats', () => {
    it.each([
        ['DB $FF', [255], 'Hex with $'],
        ['DB 0xFF', [255], 'Hex with 0x'],
        ['DB 0FFh', [255], 'Hex with h suffix'],
        ['DB %11110000', [240], 'Binary with %'],
        ['DB 0b11110000', [240], 'Binary with 0b'],
        ['DB 255', [255], 'Decimal'],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

describe('Character Constants', () => {
    it.each([
        ["DB 'A'", [65], 'Single char'],
        ["CP 'a'", [0xFE, 0x61], 'Char in instruction (lowercase)'],
        ["CP 'Z'", [0xFE, 0x5A], 'Char in instruction (uppercase)'],
        ["CP '\\\\'", [0xFE, 0x5C], 'Escaped backslash'],
    ])('%s', (src, expected) => { expectBytes(src, expected); });
});

// ==================== MACRO TESTS ====================

describe('Simple Macros', () => {
    it('expansion', () => {
        expect(bytes('MACRO NOP2\nNOP\nNOP\nENDM\nNOP2').length).toBe(2);
    });

    it('with param (comma)', () => {
        expectBytes('MACRO LOAD, val\nLD A, val\nENDM\nLOAD 42', [0x3E, 42]);
    });

    it('with param (space)', () => {
        expectBytes('MACRO LOAD val\nLD A, val\nENDM\nLOAD 42', [0x3E, 42]);
    });
});

describe('Alternative Macro Syntax', () => {
    it('label-style definition', () => {
        expect(bytes('NOP2 MACRO\nNOP\nNOP\nENDM\nNOP2').length).toBe(2);
    });
});

describe('Multiple Parameters', () => {
    it('macro with multiple params', () => {
        expectBytes('MACRO TEXT y, x, txt\nDEFB y, x\nENDM\nTEXT 5, 12, 65', [5, 12]);
    });
});

describe('Multiple Calls', () => {
    it('multiple macro calls', () => {
        expect(bytes('MACRO INC2\nINC A\nINC A\nENDM\nINC2\nINC2').length).toBe(4);
    });
});

describe('REPT/DUP', () => {
    it('REPT simple', () => {
        expect(bytes('REPT 3\nNOP\nENDR').length).toBe(3);
    });

    it('REPT with expression', () => {
        expect(bytes('COUNT EQU 4\nREPT COUNT\nNOP\nENDR').length).toBe(4);
    });

    it('DUP alias', () => {
        expect(bytes('DUP 2\nRET\nEDUP').length).toBe(2);
    });
});

// ==================== CONDITIONAL TESTS ====================

describe('IF/ENDIF', () => {
    it('true includes code', () => {
        const result = bytes('IF 1\nNOP\nENDIF');
        expect(result.length).toBe(1);
        expect(result[0]).toBe(0x00);
    });

    it('false excludes code', () => {
        expect(bytes('IF 0\nNOP\nENDIF').length).toBe(0);
    });
});

describe('IF/ELSE/ENDIF', () => {
    it('else branch', () => {
        const result = bytes('IF 0\nNOP\nELSE\nRET\nENDIF');
        expect(result.length).toBe(1);
        expect(result[0]).toBe(0xC9);
    });

    it('if branch', () => {
        const result = bytes('IF 1\nNOP\nELSE\nRET\nENDIF');
        expect(result.length).toBe(1);
        expect(result[0]).toBe(0x00);
    });
});

describe('IFDEF/IFNDEF', () => {
    it('IFDEF defined', () => {
        expect(bytes('DEBUG EQU 1\nIFDEF DEBUG\nNOP\nENDIF').length).toBe(1);
    });

    it('IFNDEF undefined', () => {
        expect(bytes('IFNDEF UNDEFINED\nNOP\nENDIF').length).toBe(1);
    });

    it('IFDEF undefined', () => {
        expect(bytes('IFDEF UNDEFINED\nNOP\nENDIF').length).toBe(0);
    });
});

describe('Nested Conditionals', () => {
    it('both true', () => {
        expect(bytes('IF 1\nIF 1\nNOP\nENDIF\nENDIF').length).toBe(1);
    });

    it('inner false', () => {
        expect(bytes('IF 1\nIF 0\nNOP\nENDIF\nENDIF').length).toBe(0);
    });

    it('outer false', () => {
        expect(bytes('IF 0\nIF 1\nNOP\nENDIF\nENDIF').length).toBe(0);
    });
});

describe('DEFINE', () => {
    it('simple', () => {
        expect(bytes('DEFINE DEBUG\nIFDEF DEBUG\nNOP\nENDIF').length).toBe(1);
    });

    it('with value (space)', () => {
        expectBytes('DEFINE VERSION 5\nLD A, VERSION', [0x3E, 5]);
    });

    it('with value (comma)', () => {
        expectBytes('DEFINE VERSION, 10\nLD A, VERSION', [0x3E, 10]);
    });
});
