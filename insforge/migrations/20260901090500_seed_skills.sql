-- कामगार — trade/skill catalogue (reference data, not demo data)
INSERT INTO public.skills (name, name_hi, category, icon) VALUES
  ('Mason',            'मिस्त्री',            'construction', '🧱'),
  ('Helper',           'हेल्पर / बेलदार',      'construction', '🧑‍🏭'),
  ('Electrician',      'इलेक्ट्रिशियन',        'technical',    '💡'),
  ('Plumber',          'प्लंबर',              'technical',    '🚰'),
  ('Carpenter',        'कारपेंटर / बढ़ई',      'woodwork',     '🪚'),
  ('Painter',          'पेंटर',               'finishing',    '🎨'),
  ('Welder',           'वेल्डर',              'technical',    '🔥'),
  ('Tile Fitter',      'टाइल्स मिस्त्री',      'finishing',    '🧿'),
  ('Bar Bender',       'सरिया बेंडर',         'construction', '🪝'),
  ('Shuttering Carpenter','शटरिंग कारपेंटर',  'construction', '🪵'),
  ('POP / False Ceiling','पीओपी / फॉल्स सीलिंग','finishing',  '🏠'),
  ('Driver',           'ड्राइवर',             'transport',    '🚚'),
  ('Loader',           'लोडर / पल्लेदार',      'labour',       '📦'),
  ('Gardener',         'माली',                'labour',       '🌱'),
  ('Housekeeping',     'सफाई कर्मचारी',        'services',     '🧹'),
  ('Cook',             'रसोइया',              'services',     '🍲'),
  ('Security Guard',   'सुरक्षा गार्ड',        'services',     '🛡️'),
  ('AC Technician',    'एसी टेक्नीशियन',       'technical',    '❄️'),
  ('Fabricator',       'फैब्रिकेटर',          'technical',    '⚙️'),
  ('Farm Labour',      'खेत मजदूर',           'agriculture',  '🌾')
ON CONFLICT (name) DO UPDATE SET name_hi = EXCLUDED.name_hi, icon = EXCLUDED.icon;
