//
// Group5
// A 1-bpp image decoder
//
// Written by Larry Bank
// Copyright (c) 2024 BitBank Software, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file ./LICENSE.
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0, included in the file
// ./APL.txt.

// Converted from C to Javascript by Nic Limper

// Define constants
const MAX_IMAGE_FLIPS = 640;

// Horizontal prefix bits
const HORIZ_SHORT_SHORT = 0;
const HORIZ_SHORT_LONG = 1;
const HORIZ_LONG_SHORT = 2;
const HORIZ_LONG_LONG = 3;

// Return code for encoder and decoder
const G5_SUCCESS = 0;
const G5_INVALID_PARAMETER = 1;
const G5_DECODE_ERROR = 2;
const G5_UNSUPPORTED_FEATURE = 3;
const G5_ENCODE_COMPLETE = 4;
const G5_DECODE_COMPLETE = 5;
const G5_NOT_INITIALIZED = 6;
const G5_DATA_OVERFLOW = 7;
const G5_MAX_FLIPS_EXCEEDED = 8;

// Utility function equivalent to the TIFFMOTOLONG macro - optimized
function TIFFMOTOLONG(p, ix) {
    const len = p.length;
    if (ix >= len) return 0;
    
    let value = p[ix] << 24;
    if (ix + 1 < len) value |= p[ix + 1] << 16;
    if (ix + 2 < len) value |= p[ix + 2] << 8;
    if (ix + 3 < len) value |= p[ix + 3];
    return value;
}

// Constants for bit manipulation
const REGISTER_WIDTH = 32; // Must align with a 32-bit system in C++

/*
 The code tree that follows has: bit_length, decode routine
 These codes are for Group 4 (MMR) decoding

 01 = vertneg1, 11h = vert1, 20h = horiz, 30h = pass, 12h = vert2
 02 = vertneg2, 13h = vert3, 03 = vertneg3, 90h = trash
*/

const code_table = [
    0x90, 0, 0x40, 0,       // trash, uncompressed mode - codes 0 and 1
    3, 7,                   // V(-3) pos = 2
    0x13, 7,                // V(3)  pos = 3
    2, 6, 2, 6,             // V(-2) pos = 4,5
    0x12, 6, 0x12, 6,       // V(2)  pos = 6,7
    0x30, 4, 0x30, 4, 0x30, 4, 0x30, 4,    // pass  pos = 8->F
    0x30, 4, 0x30, 4, 0x30, 4, 0x30, 4,
    0x20, 3, 0x20, 3, 0x20, 3, 0x20, 3,    // horiz pos = 10->1F
    0x20, 3, 0x20, 3, 0x20, 3, 0x20, 3,
    0x20, 3, 0x20, 3, 0x20, 3, 0x20, 3,
    0x20, 3, 0x20, 3, 0x20, 3, 0x20, 3,    // V(-1) pos = 20->2F
    1, 3, 1, 3, 1, 3, 1, 3,
    1, 3, 1, 3, 1, 3, 1, 3,
    1, 3, 1, 3, 1, 3, 1, 3,
    1, 3, 1, 3, 1, 3, 1, 3,
    0x11, 3, 0x11, 3, 0x11, 3, 0x11, 3,   // V(1)   pos = 30->3F
    0x11, 3, 0x11, 3, 0x11, 3, 0x11, 3,
    0x11, 3, 0x11, 3, 0x11, 3, 0x11, 3,
    0x11, 3, 0x11, 3, 0x11, 3, 0x11, 3
];

class G5DECIMAGE {
    constructor() {
        this.iWidth = 0;
        this.iHeight = 0;
        this.iError = 0;
        this.y = 0;
        this.iVLCSize = 0;
        this.iHLen = 0;
        this.iPitch = 0;
        this.u32Accum = 0;
        this.ulBitOff = 0;
        this.ulBits = 0;
        this.pSrc = null; // Input buffer
        this.pBuf = null; // Current buffer index
        this.pBufIndex = 0;
        this.pCur = new Int16Array(MAX_IMAGE_FLIPS); // Current state
        this.pRef = new Int16Array(MAX_IMAGE_FLIPS); // Reference state
        this.u32HMask = 0; // Pre-calculated horizontal mask
        this.bytesPerLine = 0; // Pre-calculated bytes per line
    }

    // Consolidated bit buffer loading function to avoid duplication
    loadBitBuffer() {
        if (this.ulBitOff > (REGISTER_WIDTH - 8)) {
            this.pBufIndex += (this.ulBitOff >> 3);
            this.ulBitOff &= 7;
            this.ulBits = TIFFMOTOLONG(this.pBuf, this.pBufIndex);
        }
    }

    // Extended bit buffer loading for 16-bit operations
    loadBitBuffer16() {
        if (this.ulBitOff > (REGISTER_WIDTH - 16)) {
            this.pBufIndex += (this.ulBitOff >> 3);
            this.ulBitOff &= 7;
            this.ulBits = TIFFMOTOLONG(this.pBuf, this.pBufIndex);
        }
    }
}


//static int g5_decode_init(G5DECIMAGE *pImage, int iWidth, int iHeight, uint8_t *pData, int iDataSize)
function g5_decode_init(pImage, iWidth, iHeight, pData, iDataSize) {
    if (
        pImage == null ||
        iWidth < 1 ||
        iHeight < 1 ||
        pData == null ||
        iDataSize < 1
    ) {
        return G5_INVALID_PARAMETER;
    }

    pImage.iVLCSize = iDataSize;
    pImage.pSrc = pData;
    pImage.ulBitOff = 0;
    pImage.y = 0;
    pImage.ulBits = TIFFMOTOLONG(pData, 0); // Preload the first 32 bits of data
    pImage.iWidth = iWidth;
    pImage.iHeight = iHeight;
    
    // Pre-calculate commonly used values
    pImage.iHLen = 32 - Math.clz32(iWidth);
    pImage.u32HMask = (1 << pImage.iHLen) - 1;
    pImage.bytesPerLine = (iWidth + 7) >> 3;

    return G5_SUCCESS;
}


//static void G5DrawLine(G5DECIMAGE *pPage, int16_t *pCurFlips, uint8_t *pOut)
function G5DrawLine(pPage, pCurFlips, pOut) {
    const xright = pPage.iWidth;
    let pCurIndex = 0;

    // Initialize output to white (0xff) - use pre-calculated length
    pOut.fill(0xff, 0, pPage.bytesPerLine);

    while (pCurIndex < pCurFlips.length - 1) {
        const startX = pCurFlips[pCurIndex++]; // Black starting point
        if (startX >= xright) break;
        
        const endX = pCurFlips[pCurIndex++];
        const run = endX - startX; // Get the black run

        if (run <= 0) break;

        // Calculate visible run
        const visibleX = Math.max(0, startX);
        const visibleRun = Math.min(xright, endX) - visibleX;

        if (visibleRun > 0) {
            const startByte = visibleX >> 3;
            const endByte = (visibleX + visibleRun - 1) >> 3;

            if (endByte === startByte) {
                // If the run fits in a single byte, combine left and right bit masks
                const lBit = 0xff << (8 - (visibleX & 7));
                const rBit = 0xff >> ((visibleX + visibleRun) & 7);
                pOut[startByte] &= (lBit | rBit) & 0xff;
            } else {
                // Mask the left-most byte
                pOut[startByte] &= (0xff << (8 - (visibleX & 7))) & 0xff;

                // Set intermediate bytes to 0
                for (let i = startByte + 1; i < endByte; i++) {
                    pOut[i] = 0x00;
                }

                // Mask the right-most byte if it's not fully aligned
                if (endByte < pPage.bytesPerLine) {
                    pOut[endByte] &= 0xff >> ((visibleX + visibleRun) & 7);
                }
            }
        }
    }
}


// Initialize internal structures to decode the image
//
function Decode_Begin(pPage) {
    const xsize = pPage.iWidth;

    // Seed the current and reference lines with xsize for V(0) codes
    pPage.pRef.fill(xsize, 0, MAX_IMAGE_FLIPS - 2);
    pPage.pCur.fill(xsize, 0, MAX_IMAGE_FLIPS - 2);

    // Prefill both current and reference lines with 0x7fff to prevent walking off the end
    // if the data gets bunged and the current X is > XSIZE
    pPage.pCur[MAX_IMAGE_FLIPS - 2] = pPage.pRef[MAX_IMAGE_FLIPS - 2] = 0x7fff;
    pPage.pCur[MAX_IMAGE_FLIPS - 1] = pPage.pRef[MAX_IMAGE_FLIPS - 1] = 0x7fff;

    pPage.pBuf = pPage.pSrc; // Start buffer
    pPage.pBufIndex = 0;

    // Load 32 bits to start (use a helper function to interpret bytes as a 32-bit integer)
    pPage.ulBits = TIFFMOTOLONG(pPage.pSrc, 0);
    pPage.ulBitOff = 0;
}


// Decode a single line of G5 data - optimized version
//
function DecodeLine(pPage) {
    let a0 = -1;
    let a0_p, b1;
    let pCurIndex = 0, pRefIndex = 0;
    const pCur = pPage.pCur;
    const pRef = pPage.pRef;
    const xsize = pPage.iWidth;
    const u32HLen = pPage.iHLen;
    const u32HMask = pPage.u32HMask;
    let tot_run, tot_run1;

    while (a0 < xsize) {
        pPage.loadBitBuffer();

        if (((pPage.ulBits << pPage.ulBitOff) & 0x80000000) !== 0) {
            a0 = pRef[pRefIndex++];
            pCur[pCurIndex++] = a0;
            pPage.ulBitOff++;
        } else {
            const lBits = (pPage.ulBits >> (REGISTER_WIDTH - 8 - pPage.ulBitOff)) & 0xfe;
            const sCode = code_table[lBits];
            pPage.ulBitOff += code_table[lBits + 1];
            
            switch (sCode) {
                case 1: case 2: case 3: // V(-1), V(-2), V(-3)
                    a0 = pRef[pRefIndex] - sCode;  // A0 = B1 - x
                    pCur[pCurIndex++] = a0;
                    if (pRefIndex == 0) {
                        pRefIndex += 2;
                    }
                    pRefIndex--;
                    while (a0 >= pRef[pRefIndex]) {
                        pRefIndex += 2;
                    }
                    break;

                case 0x11: case 0x12: case 0x13: // V(1), V(2), V(3)
                    a0 = pRef[pRefIndex++];
                    b1 = a0;
                    a0 += sCode & 7;
                    if (b1 !== xsize && a0 < xsize) {
                        while (a0 >= pRef[pRefIndex]) {
                            pRefIndex += 2;
                        }
                    }
                    if (a0 > xsize) {
                        a0 = xsize;
                    }
                    pCur[pCurIndex++] = a0;
                    break;

                case 0x20: // Horizontal codes
                    pPage.loadBitBuffer16();

                    a0_p = Math.max(0, a0);
                    const lBits = (pPage.ulBits >> ((REGISTER_WIDTH - 2) - pPage.ulBitOff)) & 0x3;
                    pPage.ulBitOff += 2;

                    switch (lBits) {
                        case HORIZ_SHORT_SHORT:
                            tot_run = (pPage.ulBits >> ((REGISTER_WIDTH - 3) - pPage.ulBitOff)) & 0x7;
                            pPage.ulBitOff += 3;
                            tot_run1 = (pPage.ulBits >> ((REGISTER_WIDTH - 3) - pPage.ulBitOff)) & 0x7;
                            pPage.ulBitOff += 3;
                            break;

                        case HORIZ_SHORT_LONG:
                            tot_run = (pPage.ulBits >> ((REGISTER_WIDTH - 3) - pPage.ulBitOff)) & 0x7;
                            pPage.ulBitOff += 3;
                            tot_run1 = (pPage.ulBits >> ((REGISTER_WIDTH - u32HLen) - pPage.ulBitOff)) & u32HMask;
                            pPage.ulBitOff += u32HLen;
                            break;

                        case HORIZ_LONG_SHORT:
                            tot_run = (pPage.ulBits >> ((REGISTER_WIDTH - u32HLen) - pPage.ulBitOff)) & u32HMask;
                            pPage.ulBitOff += u32HLen;
                            tot_run1 = (pPage.ulBits >> ((REGISTER_WIDTH - 3) - pPage.ulBitOff)) & 0x7;
                            pPage.ulBitOff += 3;
                            break;

                        case HORIZ_LONG_LONG:
                            tot_run = (pPage.ulBits >> ((REGISTER_WIDTH - u32HLen) - pPage.ulBitOff)) & u32HMask;
                            pPage.ulBitOff += u32HLen;
                            pPage.loadBitBuffer16();
                            tot_run1 = (pPage.ulBits >> ((REGISTER_WIDTH - u32HLen) - pPage.ulBitOff)) & u32HMask;
                            pPage.ulBitOff += u32HLen;
                            break;
                    }
                    a0 = a0_p + tot_run;
                    pCur[pCurIndex++] = a0;
                    a0 += tot_run1;

                    if (a0 < xsize) {
                        while (a0 >= pRef[pRefIndex]) {
                            pRefIndex += 2;
                        }
                    }
                    pCur[pCurIndex++] = a0;
                    break;

                case 0x30: // Pass code
                    pRefIndex++;
                    a0 = pRef[pRefIndex++];
                    break;

                default: // ERROR
                    pPage.iError = G5_DECODE_ERROR;
                    return pPage.iError;
            }
        }
    }

    pCur[pCurIndex++] = xsize;
    pCur[pCurIndex++] = xsize;

    return pPage.iError;
}


function processG5(data, width, height) {
    try {
        const decoder = new G5DECIMAGE();
        const initResult = g5_decode_init(decoder, width, height, data, data.length);

        if (initResult !== G5_SUCCESS) {
            throw new Error(`Initialization failed with code: ${initResult}`);
        }

        Decode_Begin(decoder);

        const outputBuffer = new Uint8Array(height * decoder.bytesPerLine);

        for (let y = 0; y < height; y++) {
            const lineStart = y * decoder.bytesPerLine;
            const lineBuffer = outputBuffer.subarray(lineStart, lineStart + decoder.bytesPerLine);
            decoder.y = y;
            
            const decodeResult = DecodeLine(decoder);
            if (decodeResult !== G5_SUCCESS) {
                console.log(`Decoding error on line ${y}: ${decoder.iError}`);
            }

            G5DrawLine(decoder, decoder.pCur, lineBuffer);
            
            // Swap current and reference lines efficiently
            [decoder.pRef, decoder.pCur] = [decoder.pCur, decoder.pRef];
        }

        return outputBuffer;
    } catch (error) {
        console.error("Error during G5 decoding:", error.message);
        return null;
    }
}


