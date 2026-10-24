**Option 1, Carried** (option-1.svg): the Digital Porters mountain stands on the transfer arrow; the mark's flat base line becomes the arrow shaft and its long left slope runs on as the arrow's tail.

Inherits the mark directly: the exact DP polygon reversed to white on the logo's own navy #182D52, sharp corners, an arrowhead built from the mark's ~45° slopes; the app accent #4F8CFF is the only added color and it carries the transfer.

**Option 2, Card to drive** (option-2.svg): an SD card holding the DP mountain as its media offloads through an accent arrow into a drive, all drawn in one 48 px monoline on the DP surface tile #F5F9FF.

Inherits through the mark on the card (exact polygon), the card's 45° chamfer matching the mark's slopes, a line weight of about 1/6 of the card height like the DP letter stems, square miter corners and the logo navy #182D52 as ink.

**Option 3, Port** (option-3.svg): an abstract porting symbol; a white load with a summit-shaped tip docks into the matching notch of a navy port, separated by one even gap.

Inherits the mark's geometry rather than its picture: the ~90° summit and ~45° facets, sharp corners, flat fills and no curves, with the gap standing in for the logotype's vertical rule, in DP accent #2D7FF9, primary navy #001C36 and white.

Rendering: rsvg-convert, ImageMagick and Pillow are not installed, so each SVG was rendered with `qlmanage -t -s 1024` twice (over white and over black) and its transparency recovered by difference matting because qlmanage flattens alpha; the 32 px files come from `sips -z 32 32` and contact-sheet.png was composited with a stdlib-only Python script.

Reproduce: `python3 generate.py` in this folder writes the three SVGs (helper modules kept alongside); PNGs as described above.
