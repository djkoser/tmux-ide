// Take an input PNG, scale it to `contentSize` and place it centered on a
// transparent `canvasSize` × `canvasSize` canvas. Output as PNG. Used by
// `build-icon.mjs` to add macOS-standard ~10% margin around content
// rendered by Apple's `ictool` (which produces full-bleed images by
// default).
//
// Usage: swift pad-icon.swift <input> <output> <canvasSize> <contentSize>

import AppKit
import CoreGraphics
import Foundation

guard CommandLine.arguments.count >= 5 else {
    FileHandle.standardError.write("Usage: pad-icon <input> <output> <canvasSize> <contentSize>\n".data(using: .utf8)!)
    exit(2)
}
let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]
guard let canvasSize = Int(CommandLine.arguments[3]),
      let contentSize = Int(CommandLine.arguments[4]) else {
    exit(2)
}

guard let img = NSImage(contentsOfFile: inputPath) else {
    FileHandle.standardError.write("Failed to load \(inputPath)\n".data(using: .utf8)!)
    exit(1)
}

let canvas = NSImage(size: NSSize(width: canvasSize, height: canvasSize))
canvas.lockFocus()
NSColor.clear.set()
NSRect(x: 0, y: 0, width: canvasSize, height: canvasSize).fill()

let inset = (canvasSize - contentSize) / 2
let dst = NSRect(x: inset, y: inset, width: contentSize, height: contentSize)
img.draw(in: dst, from: .zero, operation: .copy, fraction: 1.0)
canvas.unlockFocus()

guard let tiff = canvas.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
    FileHandle.standardError.write("Failed to encode PNG\n".data(using: .utf8)!)
    exit(1)
}
try png.write(to: URL(fileURLWithPath: outputPath))
