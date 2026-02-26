<script lang="ts">
    let activeSubtab: 'io' | 'timings' | 'opcodes' = $state('io');

    function selectSubtab(tab: 'io' | 'timings' | 'opcodes') {
        activeSubtab = tab;
    }
</script>

<div class="tab-content" id="tab-info">
    <div class="info-tab-content">
        <div class="info-subtab-bar">
            <button
                class="info-subtab-btn"
                class:active={activeSubtab === 'io'}
                onclick={() => selectSubtab('io')}
            >I/O</button>
            <button
                class="info-subtab-btn"
                class:active={activeSubtab === 'timings'}
                onclick={() => selectSubtab('timings')}
            >Timings</button>
            <button
                class="info-subtab-btn"
                class:active={activeSubtab === 'opcodes'}
                onclick={() => selectSubtab('opcodes')}
            >Opcodes</button>
        </div>

        <!-- I/O Sub-tab -->
        <div class="info-subtab-content" class:active={activeSubtab === 'io'} id="info-io">
            <div class="keyboard-image">
                <img src="keyboard.png" alt="ZX Spectrum Keyboard Layout">
            </div>

            <div class="info-section">
                <h4>Keyboard Port (IN #xxFE)</h4>
                <p>Read keyboard half-rows via port #FE. High byte selects row(s). <strong>Bit = 0 when key pressed</strong> (active low).</p>
                <table class="info-table">
                    <thead>
                        <tr><th>High Byte</th><th>Bit 0</th><th>Bit 1</th><th>Bit 2</th><th>Bit 3</th><th>Bit 4</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>#FE (254)</td><td>Shift</td><td>Z</td><td>X</td><td>C</td><td>V</td></tr>
                        <tr><td>#FD (253)</td><td>A</td><td>S</td><td>D</td><td>F</td><td>G</td></tr>
                        <tr><td>#FB (251)</td><td>Q</td><td>W</td><td>E</td><td>R</td><td>T</td></tr>
                        <tr><td>#F7 (247)</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr>
                        <tr><td>#EF (239)</td><td>0</td><td>9</td><td>8</td><td>7</td><td>6</td></tr>
                        <tr><td>#DF (223)</td><td>P</td><td>O</td><td>I</td><td>U</td><td>Y</td></tr>
                        <tr><td>#BF (191)</td><td>Enter</td><td>L</td><td>K</td><td>J</td><td>H</td></tr>
                        <tr><td>#7F (127)</td><td>Space</td><td>Sym</td><td>M</td><td>N</td><td>B</td></tr>
                    </tbody>
                </table>
                <p>Bits 5-7 always return 1. Multiple rows can be scanned at once (AND high bytes together).</p>
            </div>

            <div class="info-section">
                <h4>Kempston Joystick (IN #1F / #DF)</h4>
                <p>Read joystick state via port #1F (or #DF). <strong>Bit = 1 when pressed</strong> (active high — opposite to keyboard!).</p>
                <table class="info-table">
                    <thead>
                        <tr><th>Bit</th><th>Direction/Button</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>0</td><td>Right</td></tr>
                        <tr><td>1</td><td>Left</td></tr>
                        <tr><td>2</td><td>Down</td></tr>
                        <tr><td>3</td><td>Up</td></tr>
                        <tr><td>4</td><td>Fire</td></tr>
                        <tr><td>5-7</td><td>Not used (typically 0)</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="info-section">
                <h4>Kempston Mouse</h4>
                <p>Mouse interface uses three ports:</p>
                <table class="info-table">
                    <thead>
                        <tr><th>Port</th><th>Function</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>#FBDF</td><td>Buttons</td><td>Bit 0=Right, Bit 1=Left, Bit 2=Middle (active low: 0=pressed)</td></tr>
                        <tr><td>#FFDF</td><td>X position</td><td>0-255, wraps around</td></tr>
                        <tr><td>#FADF</td><td>Y position</td><td>0-255, wraps around</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="info-section">
                <h4>Input State Summary</h4>
                <table class="info-table">
                    <thead>
                        <tr><th>Device</th><th>Pressed State</th><th>Not Pressed</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>Keyboard</td><td><strong>0</strong> (active low)</td><td>1</td></tr>
                        <tr><td>Kempston Joystick</td><td><strong>1</strong> (active high)</td><td>0</td></tr>
                        <tr><td>Kempston Mouse buttons</td><td><strong>0</strong> (active low)</td><td>1</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="info-section">
                <h4>Border/Attribute Colors</h4>
                <table class="info-table">
                    <thead>
                        <tr><th>Value</th><th>Color</th><th>Bright</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>0</td><td style="color:#000">Black</td><td style="color:#000">Black</td></tr>
                        <tr><td>1</td><td style="color:#0000D7">Blue</td><td style="color:#0000FF">Bright Blue</td></tr>
                        <tr><td>2</td><td style="color:#D70000">Red</td><td style="color:#FF0000">Bright Red</td></tr>
                        <tr><td>3</td><td style="color:#D700D7">Magenta</td><td style="color:#FF00FF">Bright Magenta</td></tr>
                        <tr><td>4</td><td style="color:#00D700">Green</td><td style="color:#00FF00">Bright Green</td></tr>
                        <tr><td>5</td><td style="color:#00D7D7">Cyan</td><td style="color:#00FFFF">Bright Cyan</td></tr>
                        <tr><td>6</td><td style="color:#D7D700">Yellow</td><td style="color:#FFFF00">Bright Yellow</td></tr>
                        <tr><td>7</td><td style="color:#D7D7D7">White</td><td style="color:#FFFFFF">Bright White</td></tr>
                    </tbody>
                </table>
                <p>Border: bits 0-2 of port #FE. Attributes: INK (bits 0-2), PAPER (bits 3-5), BRIGHT (bit 6), FLASH (bit 7).</p>
            </div>

            <div class="info-section">
                <h4>ULAplus (Extended Palette)</h4>
                <p>ULAplus extends the Spectrum to 64 simultaneous colors from a 256-color palette.</p>
                <table class="info-table">
                    <thead>
                        <tr><th>Port</th><th>Function</th><th>Access</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>#BF3B</td><td>Register select</td><td>Write only</td></tr>
                        <tr><td>#FF3B</td><td>Data port</td><td>Read/Write</td></tr>
                    </tbody>
                </table>
                <p><strong>Register port (#BF3B) format:</strong></p>
                <table class="info-table">
                    <thead>
                        <tr><th>Bits</th><th>Function</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>7-6</td><td>Group: 00=Palette, 01=Mode</td></tr>
                        <tr><td>5-0</td><td>Palette entry (0-63) when group=00</td></tr>
                    </tbody>
                </table>
                <p><strong>Palette data format (GRB):</strong></p>
                <table class="info-table">
                    <thead>
                        <tr><th>Bits</th><th>Color</th><th>Range</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>7-5</td><td>Green</td><td>0-7</td></tr>
                        <tr><td>4-2</td><td>Red</td><td>0-7</td></tr>
                        <tr><td>1-0</td><td>Blue</td><td>0-3 (expanded to 0-7)</td></tr>
                    </tbody>
                </table>
                <p>Blue expansion: 00→000, 01→011, 10→101, 11→111</p>
                <p><strong>Palette organization (4 CLUTs x 16 colors):</strong></p>
                <table class="info-table">
                    <thead>
                        <tr><th>Entry</th><th>CLUT</th><th>Type</th><th>Index</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>0-7</td><td>0</td><td>INK</td><td>Attr bits 0-2</td></tr>
                        <tr><td>8-15</td><td>0</td><td>PAPER</td><td>Attr bits 3-5</td></tr>
                        <tr><td>16-23</td><td>1</td><td>INK</td><td>BRIGHT=1</td></tr>
                        <tr><td>24-31</td><td>1</td><td>PAPER</td><td>BRIGHT=1</td></tr>
                        <tr><td>32-39</td><td>2</td><td>INK</td><td>FLASH=1</td></tr>
                        <tr><td>40-47</td><td>2</td><td>PAPER</td><td>FLASH=1</td></tr>
                        <tr><td>48-55</td><td>3</td><td>INK</td><td>FLASH=1, BRIGHT=1</td></tr>
                        <tr><td>56-63</td><td>3</td><td>PAPER</td><td>FLASH=1, BRIGHT=1</td></tr>
                    </tbody>
                </table>
                <p>CLUT selection: <code>(FLASH x 2 + BRIGHT)</code>. Border uses PAPER color from CLUT 0.</p>
                <p><strong>Mode register (group=01):</strong> Bit 0 = ULAplus on/off, Bit 1 = Grayscale mode.</p>
                <p><strong>Raster effects:</strong> HAM256 and similar demos that update palette mid-frame are fully supported. The emulator tracks palette writes with T-state timing and applies them per 16-line group.</p>
            </div>

            <div class="info-section">
                <h4>AY-3-8910 Sound Chip (128K)</h4>
                <p>The AY sound chip is clocked at 1.7734 MHz on 128K models.</p>
                <table class="info-table">
                    <thead>
                        <tr><th>Port</th><th>Function</th><th>Access</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>#FFFD</td><td>Register select / read</td><td>Read/Write</td></tr>
                        <tr><td>#BFFD</td><td>Data write</td><td>Write only</td></tr>
                    </tbody>
                </table>
                <p><strong>Registers:</strong></p>
                <table class="info-table">
                    <thead>
                        <tr><th>Reg</th><th>Function</th><th>Bits</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>0</td><td>Channel A pitch fine</td><td>8</td></tr>
                        <tr><td>1</td><td>Channel A pitch coarse</td><td>4</td></tr>
                        <tr><td>2</td><td>Channel B pitch fine</td><td>8</td></tr>
                        <tr><td>3</td><td>Channel B pitch coarse</td><td>4</td></tr>
                        <tr><td>4</td><td>Channel C pitch fine</td><td>8</td></tr>
                        <tr><td>5</td><td>Channel C pitch coarse</td><td>4</td></tr>
                        <tr><td>6</td><td>Noise pitch</td><td>5</td></tr>
                        <tr><td>7</td><td>Mixer control</td><td>8</td></tr>
                        <tr><td>8</td><td>Channel A volume</td><td>5</td></tr>
                        <tr><td>9</td><td>Channel B volume</td><td>5</td></tr>
                        <tr><td>10</td><td>Channel C volume</td><td>5</td></tr>
                        <tr><td>11</td><td>Envelope period fine</td><td>8</td></tr>
                        <tr><td>12</td><td>Envelope period coarse</td><td>8</td></tr>
                        <tr><td>13</td><td>Envelope shape</td><td>4</td></tr>
                    </tbody>
                </table>
                <p><strong>Mixer (R7):</strong> Bit 0-2 = Tone off (A,B,C), Bit 3-5 = Noise off (A,B,C)</p>
                <p><strong>Volume (R8-10):</strong> Bit 4 = Envelope mode, Bits 0-3 = Volume (0-15)</p>
                <p><strong>Envelope shapes (R13):</strong></p>
                <table class="info-table">
                    <thead>
                        <tr><th>Value</th><th>Shape</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>0-3</td><td>\___</td><td>Decay, hold low</td></tr>
                        <tr><td>4-7</td><td>/___</td><td>Attack, hold low</td></tr>
                        <tr><td>8</td><td>\\\\</td><td>Decay (sawtooth)</td></tr>
                        <tr><td>9</td><td>\___</td><td>Decay, hold low</td></tr>
                        <tr><td>10</td><td>\/\/</td><td>Decay-attack (triangle)</td></tr>
                        <tr><td>11</td><td>{@html '\\&#x305;&#x305;&#x305;'}</td><td>Decay, hold high</td></tr>
                        <tr><td>12</td><td>////</td><td>Attack (sawtooth)</td></tr>
                        <tr><td>13</td><td>{@html '/&#x305;&#x305;&#x305;'}</td><td>Attack, hold high</td></tr>
                        <tr><td>14</td><td>/\/\</td><td>Attack-decay (triangle)</td></tr>
                        <tr><td>15</td><td>/___</td><td>Attack, hold low</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Timings Sub-tab -->
        <div class="info-subtab-content" class:active={activeSubtab === 'timings'} id="info-timings">
            <div class="info-section">
                <h4>Frame Timing</h4>
                <table class="info-table">
                    <thead>
                        <tr><th>Parameter</th><th>48K</th><th>128K/+2/+2A</th><th>Pentagon/Scorpion</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>T-states per line</td><td>224</td><td>228</td><td>224</td></tr>
                        <tr><td>Lines per frame</td><td>312</td><td>311</td><td>320</td></tr>
                        <tr><td>T-states per frame</td><td>69888</td><td>70908</td><td>71680</td></tr>
                        <tr><td>Frame rate (Hz)</td><td>50.08</td><td>50.02</td><td>48.83</td></tr>
                        <tr><td>CPU clock (MHz)</td><td>3.5</td><td>3.5469</td><td>3.5</td></tr>
                        <tr><td>First screen line</td><td>64</td><td>63</td><td>80</td></tr>
                        <tr><td>INT length (T)</td><td>32</td><td>32</td><td>32</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="info-section">
                <h4>Border Sizes (pixels)</h4>
                <table class="info-table">
                    <thead>
                        <tr><th>Border</th><th>48K</th><th>128K/+2/+2A</th><th>Pentagon/Scorpion</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>Top (lines)</td><td>64</td><td>63</td><td>80</td></tr>
                        <tr><td>Bottom (lines)</td><td>56</td><td>56</td><td>48</td></tr>
                        <tr><td>Left (pixels)</td><td>48</td><td>48</td><td>48</td></tr>
                        <tr><td>Right (pixels)</td><td>48</td><td>48</td><td>48</td></tr>
                        <tr><td>Total visible width</td><td>352</td><td>352</td><td>352</td></tr>
                        <tr><td>Total visible height</td><td>312</td><td>311</td><td>320</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="info-section">
                <h4>Memory Map (128K/+2/+2A/Pentagon/Scorpion)</h4>
                <table class="info-table">
                    <thead>
                        <tr><th>Address</th><th>Content</th><th>Contention (128K/+2)</th><th>Contention (+2A)</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>0000-3FFF</td><td>ROM (128K: 0-1, +2A/Scorpion: 0-3)</td><td>No</td><td>No</td></tr>
                        <tr><td>4000-7FFF</td><td>RAM Bank 5 (Screen)</td><td class="contended">Yes (always)</td><td class="contended">Yes (always)</td></tr>
                        <tr><td>8000-BFFF</td><td>RAM Bank 2</td><td>No</td><td>No</td></tr>
                        <tr><td>C000-FFFF</td><td>RAM Bank 0-7 (paged)</td><td>Odd banks only</td><td>Banks 4-7 only</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="info-section">
                <h4>RAM Banks Contention</h4>
                <table class="info-table">
                    <thead>
                        <tr><th>Bank</th><th>128K/+2</th><th>+2A</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>0</td><td>No</td><td>No</td><td>Default at C000</td></tr>
                        <tr><td>1</td><td class="contended">Yes</td><td>No</td><td></td></tr>
                        <tr><td>2</td><td>No</td><td>No</td><td>Always at 8000</td></tr>
                        <tr><td>3</td><td class="contended">Yes</td><td>No</td><td></td></tr>
                        <tr><td>4</td><td>No</td><td class="contended">Yes</td><td></td></tr>
                        <tr><td>5</td><td class="contended">Yes</td><td class="contended">Yes</td><td>Always at 4000 (screen 0)</td></tr>
                        <tr><td>6</td><td>No</td><td class="contended">Yes</td><td></td></tr>
                        <tr><td>7</td><td class="contended">Yes</td><td class="contended">Yes</td><td>Screen 1 (when selected)</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="info-section">
                <h4>Contention Pattern</h4>
                <p><strong>48K:</strong> Screen lines use 192 T-states for drawing. Memory contention occurs when CPU accesses 4000-7FFF during screen drawing (lines 64-255, T-states 14-126).</p>
                <p><strong>128K/+2:</strong> Screen lines use 196 T-states for drawing (228 total per line). Contended banks: 1, 3, 5, 7 (odd).</p>
                <p><strong>+2A:</strong> Same timing as 128K. Contended banks: 4, 5, 6, 7 (high). In special paging mode, contention applies per-slot based on the mapped bank.</p>
                <p>Pattern repeats every 8 T-states: <code>6, 5, 4, 3, 2, 1, 0, 0</code> (delay in T-states)</p>
                <p>I/O contention: ULA port (xxFE) also causes delays when accessed during screen time.</p>
            </div>

            <div class="info-section">
                <h4>+2A Differences (vs 128K)</h4>
                <ul>
                    <li>4 ROM banks (64KB) selected via ports 0x7FFD bit 4 + 0x1FFD bit 2</li>
                    <li>Port 0x1FFD: special paging, ROM high bit, disk motor</li>
                    <li>4 special all-RAM paging modes (port 0x1FFD bit 0 = 1)</li>
                    <li>Different contended banks: 4, 5, 6, 7 (not 1, 3, 5, 7)</li>
                    <li>48K BASIC ROM in bank 3 (not bank 1)</li>
                </ul>
            </div>

            <div class="info-section">
                <h4>Pentagon Differences</h4>
                <ul>
                    <li>No memory or I/O contention</li>
                    <li>320 lines per frame (more top border)</li>
                    <li>TR-DOS ROM pages in/out via 3Dxx trigger</li>
                    <li>Beta Disk interface at ports 1F, 3F, 5F, 7F, FF</li>
                </ul>
            </div>

            <div class="info-section">
                <h4>Scorpion ZS 256 Differences</h4>
                <ul>
                    <li>256KB RAM (16 pages), Pentagon-compatible ULA timing</li>
                    <li>4 ROM banks: ROM0=128 BASIC, ROM1=48 BASIC, ROM2=Service Monitor, ROM3=TR-DOS</li>
                    <li>Port 0x7FFD: standard 128K paging (RAM 0-7, ROM 0/1, screen, lock)</li>
                    <li>Port 0x1FFD: bit 0 = RAM over ROM, bit 1 = ROM 2 select, bit 4 = RAM page +8</li>
                    <li>ROM selection (3-way): 1FFD.1 set → ROM 2; unset → 7FFD.4 selects ROM 0/1</li>
                    <li>TR-DOS built into ROM bank 3 (no separate trdos.rom needed)</li>
                    <li>No memory or I/O contention (same as Pentagon)</li>
                </ul>
            </div>
        </div>

        <!-- Opcodes Sub-tab -->
        <div class="info-subtab-content" class:active={activeSubtab === 'opcodes'} id="info-opcodes">
            <div class="opcodes-container">
                <div class="opcodes-header">
                    <h3>Z80 Instruction Set Reference</h3>
                    <div class="opcodes-filter">
                        <input type="text" id="opcodeSearch" placeholder="Search opcode..." class="opcode-search">
                        <select id="opcodeGroup">
                            <option value="all">All Groups</option>
                            <option value="load">Load (LD)</option>
                            <option value="arith">Arithmetic</option>
                            <option value="logic">Logic</option>
                            <option value="rotate">Rotate/Shift</option>
                            <option value="bit">Bit Operations</option>
                            <option value="jump">Jump/Call</option>
                            <option value="io">I/O</option>
                            <option value="block">Block</option>
                            <option value="misc">Misc</option>
                        </select>
                        <select id="opcodeCycles">
                            <option value="all">All T-states</option>
                        </select>
                        <select id="opcodeSort">
                            <option value="mnemonic">Sort: Mnemonic</option>
                            <option value="opcode">Sort: Opcode</option>
                        </select>
                    </div>
                </div>
                <div class="opcodes-body">
                    <table class="opcodes-table" id="opcodesTable">
                        <thead>
                            <tr>
                                <th>Mnemonic</th>
                                <th>Opcode</th>
                                <th>Size</th>
                                <th>Cycles</th>
                                <th>Flags</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody id="opcodesBody">
                        </tbody>
                    </table>
                </div>
                <div class="opcodes-footer">
                    <div class="flags-legend">
                        <span><b>Flags:</b></span>
                        <span>S=Sign</span>
                        <span>Z=Zero</span>
                        <span>H=Half-carry</span>
                        <span>P=Parity/Overflow</span>
                        <span>N=Subtract</span>
                        <span>C=Carry</span>
                        <span class="flag-symbol">*=affected</span>
                        <span class="flag-symbol">-=unchanged</span>
                        <span class="flag-symbol">0=reset</span>
                        <span class="flag-symbol">1=set</span>
                        <span class="flag-symbol">?=undefined</span>
                        <span style="color:#c080ff; margin-left:10px;"><b>*</b>=undocumented</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    /* Info Tab */
    #tab-info {
        overflow-y: auto;
        max-height: calc(100vh - 120px);
        padding-top: 0;
    }
    .info-tab-content {
        padding: 0 15px 15px 15px;
        max-width: 800px;
    }
    .info-tab-content h3 {
        margin: 0 0 15px 0;
        color: var(--accent);
        font-size: 16px;
    }
    .keyboard-image {
        margin-bottom: 15px;
        text-align: center;
    }
    .keyboard-image img {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
    }
    .info-section {
        margin-bottom: 20px;
    }
    .info-section h4 {
        margin: 0 0 8px 0;
        color: var(--cyan);
        font-size: 13px;
        border-bottom: 1px solid var(--border-secondary);
        padding-bottom: 4px;
    }
    .info-section p, .info-section li {
        font-size: 11px;
        color: var(--text-secondary);
        margin: 4px 0;
        line-height: 1.4;
    }
    .info-section ul {
        margin: 0;
        padding-left: 20px;
    }
    .info-section code {
        background: var(--bg-tertiary);
        padding: 2px 4px;
        border-radius: 2px;
        font-family: monospace;
        color: var(--text-primary);
    }
    .info-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
    }
    .info-table th, .info-table td {
        border: 1px solid var(--border-secondary);
        padding: 4px 8px;
        text-align: left;
    }
    .info-table th {
        background: var(--bg-tertiary);
        color: var(--cyan);
        font-weight: normal;
    }
    .info-table td {
        color: var(--text-secondary);
    }
    .info-table td.contended {
        color: var(--accent);
    }

    /* Info Sub-tabs */
    .info-subtab-bar {
        display: flex;
        gap: 2px;
        border-bottom: 1px solid var(--bg-button);
        position: sticky;
        top: 0;
        background: var(--bg-secondary);
        z-index: 10;
        padding: 0 10px;
        margin: 0 -10px 10px -10px;
    }
    .info-subtab-btn {
        padding: 6px 16px;
        background: var(--bg-tertiary);
        border: 1px solid var(--bg-button);
        border-bottom: none;
        border-radius: 4px 4px 0 0;
        color: var(--text-secondary);
        font-size: 12px;
        cursor: pointer;
        margin-bottom: -1px;
    }
    .info-subtab-btn:hover {
        background: var(--bg-button);
        color: var(--text-primary);
    }
    .info-subtab-btn.active {
        background: var(--bg-secondary);
        color: var(--cyan);
        border-bottom: 1px solid var(--bg-secondary);
    }
    .info-subtab-content {
        display: none;
    }
    .info-subtab-content.active {
        display: block;
    }

    /* Opcodes Tab */
    .opcodes-container {
        display: flex;
        flex-direction: column;
        height: calc(100vh - 500px);
        min-height: 400px;
        max-height: 700px;
    }
    .opcodes-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 15px;
        background: var(--bg-primary);
        border-radius: 4px;
        margin-bottom: 10px;
    }
    .opcodes-header h3 {
        margin: 0;
        color: var(--cyan);
        font-size: 14px;
    }
    .opcodes-filter {
        display: flex;
        gap: 10px;
    }
    .opcode-search {
        padding: 5px 10px;
        background: var(--bg-secondary);
        border: 1px solid var(--bg-button);
        border-radius: 4px;
        color: var(--text-primary);
        font-size: 12px;
        width: 150px;
    }
    .opcodes-filter select {
        padding: 5px 10px;
        font-size: 12px;
    }
    .opcodes-body {
        flex: 1;
        overflow-y: auto;
        background: var(--bg-primary);
        border-radius: 4px;
    }
    .opcodes-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
        font-family: monospace;
    }
    .opcodes-table thead {
        position: sticky;
        top: 0;
        background: var(--bg-button);
        z-index: 1;
    }
    .opcodes-table th {
        padding: 8px 10px;
        text-align: left;
        color: var(--cyan);
        font-weight: bold;
        border-bottom: 2px solid var(--bg-secondary);
    }
    .opcodes-table :global(td) {
        padding: 5px 10px;
        border-bottom: 1px solid var(--bg-secondary);
        vertical-align: top;
    }
    .opcodes-table :global(tr:hover) {
        background: var(--bg-button);
    }
    :global(.opcodes-table .op-mnemonic) {
        color: var(--accent);
        font-weight: bold;
        white-space: nowrap;
    }
    :global(.opcodes-table .op-mnemonic.undoc) {
        color: #c080ff;
    }
    :global(.opcodes-table .op-mnemonic.undoc::after) {
        content: '*';
        color: #ff80ff;
        font-size: 10px;
        vertical-align: super;
    }
    :global(.opcodes-table .op-opcode) {
        color: #80c0ff;
        text-align: left;
        white-space: nowrap;
    }
    :global(.opcodes-table .op-bytes) {
        color: var(--text-secondary);
        text-align: center;
    }
    :global(.opcodes-table .op-cycles) {
        color: var(--cyan);
        text-align: center;
    }
    :global(.opcodes-table .op-flags) {
        font-size: 10px;
        letter-spacing: 1px;
    }
    :global(.opcodes-table .op-desc) {
        color: var(--text-primary);
    }
    .opcodes-footer {
        padding: 8px 15px;
        background: var(--bg-primary);
        border-radius: 4px;
        margin-top: 10px;
    }
    .flags-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        font-size: 10px;
        color: var(--text-secondary);
    }
    .flags-legend .flag-symbol {
        color: var(--cyan);
    }
</style>
