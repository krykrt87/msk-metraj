# SketchUp modelinin kopyasını açar; grup/bileşen adlarını, etiketlerini, malzemelerini ve dünya
# koordinatındaki sınır kutularını (mm) work/skp/objects.json'a yazar, sonra SketchUp'ı kapatır.
# Çalıştırma: SketchUp.exe -RubyStartup scripts/takeoff/skp/dump.rb   (work/skp/model.skp kopyası üzerinde)
require 'json'
base = File.expand_path('../../../..', __FILE__)
src = File.join(base, 'work', 'skp', 'model.skp')
out = File.join(base, 'work', 'skp', 'objects.json')
log = File.join(base, 'work', 'skp', 'dump.log')
UI.start_timer(2, false) do
  begin
    File.write(log, "açılıyor #{src}\n")
    Sketchup.open_file(src)
    m = Sketchup.active_model
    res = []
    mm = ->(v) { (v.to_f * 25.4).round(1) } # iç birim inç
    walk = nil
    walk = lambda do |ents, tr, path, depth|
      ents.each do |e|
        next unless e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
        t = tr * e.transformation
        defn = e.respond_to?(:definition) ? e.definition : nil
        pts = (0..7).map { |i| defn.bounds.corner(i).transform(t) }
        xs = pts.map(&:x); ys = pts.map(&:y); zs = pts.map(&:z)
        name = e.name.to_s
        dname = defn ? defn.name.to_s : ''
        res << { path: path, name: name, def: dname, kind: e.is_a?(Sketchup::Group) ? 'G' : 'C', tag: (e.layer ? e.layer.name : ''),
                 mat: (e.material ? e.material.display_name : ''), faces: defn ? defn.entities.grep(Sketchup::Face).size : 0,
                 min: [mm.(xs.min), mm.(ys.min), mm.(zs.min)], max: [mm.(xs.max), mm.(ys.max), mm.(zs.max)], depth: depth }
        walk.(defn.entities, t, path + [name.empty? ? dname : name], depth + 1) if defn && depth < 8
      end
    end
    walk.(m.entities, Geom::Transformation.new, [], 0)
    tags = m.layers.map(&:name)
    mats = m.materials.map(&:display_name)
    File.write(out, JSON.generate({ units: 'mm', tags: tags, materials: mats, objects: res }))
    File.write(log, "tamam #{res.size} nesne\n", mode: 'a')
  rescue => ex
    File.write(log, "HATA #{ex.message}\n#{ex.backtrace.first(5).join("\n")}\n", mode: 'a')
  ensure
    Sketchup.active_model.close(true) rescue nil
    Sketchup.quit
  end
end
