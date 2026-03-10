# ZX-M8XXX Ladder

ZX-M8XXX Ladder is a ZX Spectrum emulator and debugger for the browser, derived from Bedazzle’s ZX-M8XXX and continuing development as an independent fork.

## Running the emulator

1. Install dependencies:
   ```bash
   npm install
   ```

2. ROM files are not included in the repository for legal reasons.
   You must provide them yourself.

   Place ROM files in `roms/` directory:
   - `48.rom` - ZX Spectrum 48K (16KB, required)
   - `128.rom` - ZX Spectrum 128K (32KB)
   - `plus2.rom` - ZX Spectrum +2 (32KB)
   - `plus2a.rom` - ZX Spectrum +2A (64KB)
   - `plus3.rom` - ZX Spectrum +3 (64KB)
   - `pentagon.rom` - Pentagon 128K (32KB)
   - `scorpion.rom` - Scorpion ZS 256 (64KB)
   - `trdos.rom` - TR-DOS 5.03/5.04t (16KB, for disk images)

3. Start the dev server:
   ```bash
   npm run dev
   ```

4. Open the emulator in your browser. Load games and programs by dragging & dropping:
   - **Supported formats:** TAP, TZX, SNA, Z80, SZX, TRD, SCL, DSK, RZX, or ZIP archives
   - Drag a file into the emulator UI and it will load automatically
   - For ZIP files with multiple programs, you'll be prompted to select which one to load

5. Build for production:
   ```bash
   npm run build
   ```

## Project structure

The codebase is organized as follows:
```
js/
├── core/          # Emulator engine (Z80, ULA, memory, sound)
├── sjasmplus/     # Z80 assembler
├── managers/      # Debugger state management
├── utils/         # Utilities
├── data/          # Static data
├── views/         # UI subsystems
└── app/           # Application orchestration
tests/
├── unit/          # Unit tests (assembler, Z80, system)
└── headless/      # Puppeteer-based emulator tests
docs/
└── upstream/      # Original upstream documentation
```

## Testing

Run the full test suite:
```bash
npm test                    # Run all tests and generate report
```

Run specific test groups:
```bash
npm run test:unit           # Unit tests only
npm run test:headless       # Headless emulator scenario tests
npm run test:update-hashes  # Update reference hashes for headless tests
```

View test reports:
```bash
npm run test:report
npx vite preview --outDir reports
```

The report includes screenshots (actual vs. expected) from headless emulator tests for visual verification. Artifacts are stored in `reports/artifacts`.

## Contributing

Contributions are welcome. Please ensure all tests pass before submitting pull requests:
```bash
npm test
```

## Documentation

Architecture notes and additional documentation are available in `/docs`.

For comprehensive feature documentation, click the **Help** button in the emulator UI.

**Original upstream documentation:** [docs/upstream/README-original.md](docs/upstream/README-original.md)

## Attribution

This project is derived from:

**Bedazzle – ZX-M8XXX**
https://github.com/Bedazzle/ZX-M8XXX

Licensed under GPL-3.0.

## Versioning

This fork uses semantic versioning independent of upstream (baseline: ZX-M8XXX v0.9.37).

**Compatibility Note:** Upstream compatibility is not guaranteed. This fork evolves independently and may diverge significantly in features, behavior, and architecture.
