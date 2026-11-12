# Object definitions in 8192x4096 panorama pixel coords.
# Each piece is a loose rect drawn on the background around the object; the build flood-fills
# from the rect border and keeps what the black outlines enclose. ('raw', poly) is used as-is.
def R(x0, y0, x1, y1): return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
OBJ = {  # id -> (name, [pieces], focus (x, y, fov) or None)
 1: ('globe',    [('tint', R(5020, 2115, 5205, 2365))], None),   # picked by colour: blue sphere + tan ring, stem and base
 2: ('computers',[R(5440, 2010, 5770, 2335), R(5795, 2040, 6075, 2335), R(5310, 2440, 5535, 2735),
                  R(5440, 2348, 5820, 2452), R(5825, 2370, 5915, 2458)], (5720, 2230, 50)),
 3: ('laptop',   [R(3920, 2625, 4360, 2995)], (4150, 2800, 55)),
 4: ('phone',    [R(3140, 2255, 3410, 2400)], (3260, 2330, 45)),
 5: ('certs',    [R(1635, 1795, 1750, 1950), R(1765, 1755, 1995, 1915), R(2010, 1795, 2130, 1975), R(1630, 1980, 1775, 2170),
                  R(1785, 1935, 1980, 2200), R(1995, 1995, 2130, 2155)], (1880, 1980, 60)),
 6: ('lights',   [R(1520, 1715, 1650, 1925), R(1545, 1345, 1625, 1405), ('rawline', R(1577, 1395, 1589, 1732)), R(2075, 2220, 2225, 2390), R(2930, 1845, 3085, 2440), ('raw', [(2952,2388),(3066,2384),(3066,2444),(3052,2442),(2952,2398)]),
                  R(3470, 950, 4070, 1270), R(7225, 925, 7455, 1035), R(7160, 1828, 7290, 1960), R(7735, 1682, 7810, 1840), ('rawline', R(7768, 1698, 7777, 1756))], None),
 7: ('bag',      [[(1520, 2165), (1745, 2165), (1745, 2290), (1728, 2290), (1728, 2495), (1520, 2495)]], (1630, 2330, 55)),
 8: ('notebook', [('raw', [(1306,2459),(1386,2421),(1515,2446),(1518,2468),(1449,2509),(1304,2479)])], (1410, 2480, 45)),
 9: ('name',     [R(7765, 1850, 8120, 2105), ('rawline', R(7856, 1854, 7898, 1888)), ('rawline', R(8090, 1852, 8108, 1880))], (7950, 1980, 50)),
 10: ('speaker', [R(5298, 2135, 5428, 2292)], None),
 11: ('frame',    [R(255, 1575, 470, 1775)], (362, 1675, 45)),   # photo frame on the fridge -> Experience
}
# lamp shades only (the part that glows) and where each light sits
SHADES = [R(1520, 1715, 1650, 1925), R(2075, 2220, 2225, 2300), R(2930, 1845, 3085, 1985), R(3470, 950, 4070, 1270),
          R(7225, 925, 7455, 1035), R(7160, 1828, 7250, 1960), R(7735, 1740, 7810, 1840)]
LAMPS = [(1585, 1850, 1.0), (2150, 2265, 0.8), (3005, 1915, 1.0), (3760, 1100, 1.6), (7340, 980, 0.9), (7215, 1890, 0.8), (7772, 1790, 0.8)]  # x, y, strength
SCREENS = {  # seed point inside the screen + inner corners TL, TR, BR, BL
 'video':  ((5600, 2120), [(5461, 2051), (5734, 2050), (5732, 2220), (5461, 2203)]),
 'github': ((5900, 2130), [(5814, 2083), (6048, 2085), (6049, 2227), (5814, 2220)]),
 'laptop': ((4150, 2740), [(4060, 2655), (4337, 2689), (4323, 2843), (4038, 2802)]),
}
# picture frame on top of the fridge: inner opening TL, TR, BR, BL. Not clickable; shows assets/frame.jpg if that file exists.
FRAME = [(310, 1618), (435, 1625), (433, 1736), (310, 1729)]
# background colours that get trapped inside an object's outline (by a cord or a stand) and must not count as the object
DROP = {"computers": [(212, 216, 214)], "phone": [(217, 224, 212), (72, 49, 38)]}
