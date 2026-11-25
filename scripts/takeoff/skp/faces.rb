# Saçak çevresindeki yüzleri (dünya koordinatı, mm) work/skp/faces.json'a yazar: saçak altı / konsol altı biçimi için.
# Çalıştırma: SketchUp.exe -RubyStartup scripts/takeoff/skp/faces.rb   (work/skp/model.skp kopyası üzerinde)
require 'json'
base = File.expand_path('../../../..', __FILE__)
src = File.join(base, 'work', 'skp', 'model.skp')
out = File.join(base, 'work', 'skp', 'faces.json')
log = File.join(base, 'work', 'skp', 'faces.log')
Z0 = 26_000; Z1 = 31_000 # mm; model ±0,00 ≈ +21,70 → +4,30 … +9,30
BOX = [30_000, -10_000, 200_000, 125_000] # bina (Group#33) çevresi, mm
UI.start_timer(2, false) do
  begin
    File.write(log, "açılıyor #{src}\n")
    Sketchup.open_file(src)
    m = Sketchup.active_model
    mm = ->(v) { (v.to_f * 25.4).round(1) }
    res = []
    walk = nil
    walk = lambda do |ents, tr, path, depth, mat|
      ents.each do |e|
        if e.is_a?(Sketchup::Face)
          pts = e.outer_loop.vertices.map { |v| v.position.transform(tr) }
          zs = pts.map { |p| mm.(p.z) }
          xs = pts.map { |p| mm.(p.x) }
          ys = pts.map { |p| mm.(p.y) }
          next if zs.max < Z0 || zs.min > Z1 || xs.max < BOX[0] || xs.min > BOX[2] || ys.max < BOX[1] || ys.min > BOX[3]
          fm = e.material || e.back_material
          res << { p: path.join('>'), m: (fm ? fm.display_name : mat), t: e.layer.name, v: pts.map { |p| [mm.(p.x), mm.(p.y), mm.(p.z)] } }
          break if res.size > 400_000
        elsif (e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)) && depth < 10
          t = tr * e.transformation
          wz = (0..7).map { |i| mm.(e.definition.bounds.corner(i).transform(t).z) }
          next if wz.max < Z0 || wz.min > Z1
          name = e.name.to_s.empty? ? e.definition.name.to_s : e.name.to_s
          walk.(e.definition.entities, t, path + [name], depth + 1, e.material ? e.material.display_name : mat)
        end
      end
    end
    walk.(m.entities, Geom::Transformation.new, [], 0, '')
    File.write(out, JSON.generate({ units: 'mm', faces: res }))
    File.write(log, "tamam #{res.size} yüz\n", mode: 'a')
  rescue => ex
    File.write(log, "HATA #{ex.message}\n#{ex.backtrace.first(5).join("\n")}\n", mode: 'a')
  ensure
    Sketchup.active_model.close(true) rescue nil
    Sketchup.quit
  end
end
