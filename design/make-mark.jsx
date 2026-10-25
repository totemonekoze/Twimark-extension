// 拡張のページのボタン（投稿・記事のブックマークの隣）の絵を Illustrator で描き、SVG に書き出す台本（ExtendScript）。定義 2026-10-25-009、描き直しは 2026-10-25-010。
// 流し方: PowerShell から COM で  $ai = New-Object -ComObject Illustrator.Application; $ai.DoJavaScriptFile(<この台本>, @(<プロジェクトの根>))
// 24×24 の格子に2つ描く。サイトのブックマーク（しおり）と見分けるため、しおりではなく、Twimark の頭文字「T」を角丸の四角に入れた形にする。
//   mark.svg       未追加: 角丸の四角の輪郭（線 2）と塗りの T。黄緑 #76A040（白の地で 3:1）
//   mark-saved.svg 追加済み: 黄緑 #8DB255 の角丸の四角に白の T。未追加と同じ外形（2〜22）
// 書き出した SVG（src/icons/）の座標を、content.js がそのまま埋め込んで使う。.ai は design/twimark-mark.ai に保存する
var ROOT = arguments[0];
var S = 24;

function rgb(hex) {
  var c = new RGBColor();
  c.red = parseInt(hex.substr(1, 2), 16);
  c.green = parseInt(hex.substr(3, 2), 16);
  c.blue = parseInt(hex.substr(5, 2), 16);
  return c;
}
// 画面の座標（左上が原点、下へ正）で点を並べる
function shape(layer, pts) {
  var p = layer.pathItems.add();
  var list = [];
  for (var i = 0; i < pts.length; i++) list.push([pts[i][0], -pts[i][1]]);
  p.setEntirePath(list);
  p.closed = true;
  return p;
}
// 「T」（横棒 7.5〜16.5 × 7〜9.6、縦棒 10.7〜13.3 × 7〜17）。2つの絵で同じ形
var T = [[7.5, 7], [16.5, 7], [16.5, 9.6], [13.3, 9.6], [13.3, 17], [10.7, 17], [10.7, 9.6], [7.5, 9.6]];
function newDoc() {
  app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  var doc = app.documents.add(DocumentColorSpace.RGB, S, S);
  doc.artboards[0].artboardRect = [0, 0, S, -S];
  return doc;
}
function svg(doc, file) {
  var o = new ExportOptionsSVG();
  o.embedRasterImages = false;
  o.coordinatePrecision = 2;
  o.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;
  o.documentEncoding = SVGDocumentEncoding.UTF8;
  o.fontSubsetting = SVGFontSubsetting.None;
  doc.exportFile(new File(file), ExportType.SVG, o);
}

// 未追加: 角丸の四角の輪郭（線の中心で 3〜21、外形 2〜22）と塗りの T
var d1 = newDoc();
var l1 = d1.layers[0];
var frame = l1.pathItems.roundedRectangle(-3, 3, 18, 18, 4.5, 4.5);
frame.filled = false;
frame.stroked = true;
frame.strokeWidth = 2;
frame.strokeColor = rgb('#76A040');
var t1 = shape(l1, T);
t1.stroked = false;
t1.fillColor = rgb('#76A040');
svg(d1, ROOT + '/src/icons/mark.svg');

// 追加済み: 黄緑の角丸の四角（2〜22）に白の T
var d2 = newDoc();
var l2 = d2.layers[0];
var bg = l2.pathItems.roundedRectangle(-2, 2, 20, 20, 5.5, 5.5);
bg.stroked = false;
bg.fillColor = rgb('#8DB255');
var t2 = shape(l2, T);
t2.stroked = false;
t2.fillColor = rgb('#FFFFFF');
svg(d2, ROOT + '/src/icons/mark-saved.svg');

// 両方の形を1つの .ai に残す（2つ目の書類をアートボードごと保存）
var ai = new IllustratorSaveOptions();
d2.saveAs(new File(ROOT + '/design/twimark-mark.ai'), ai);
d1.close(SaveOptions.DONOTSAVECHANGES);
d2.close(SaveOptions.DONOTSAVECHANGES);
'ok';
