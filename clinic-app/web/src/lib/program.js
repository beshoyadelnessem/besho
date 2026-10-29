// Phase guidance shown to staff when prescribing. Progression is criteria-based and
// decided by the therapist, not by calendar time alone. Review with your clinical lead.
export const PHASES = {
  1: {
    en: { title: 'Phase 1: protection and early motion',
      next: ['Full knee extension, equal to the healthy side', 'Little or no effusion', 'Straight leg raise without extension lag', 'Normal gait without crutches'] },
    ar: { title: 'المرحلة 1: الحماية والحركة المبكرة',
      next: ['فرد كامل للركبة زي الرجل السليمة', 'تورم بسيط أو مفيش', 'رفع الرجل مفرودة من غير ما الركبة تتني (no extension lag)', 'مشي طبيعي من غير عكاز'] },
    de: { title: 'Phase 1: Schutz und frühe Beweglichkeit',
      next: ['Volle Kniestreckung wie auf der gesunden Seite', 'Wenig oder kein Erguss', 'Gestrecktes Beinheben ohne Streckdefizit', 'Normales Gangbild ohne Gehstützen'] },
  },
  2: {
    en: { title: 'Phase 2: strength and neuromuscular control',
      next: ['Near-full range of motion', 'No swelling after exercise', 'Thigh strength close to the healthy side (clinic test)', 'Good knee control in mini squats and step-ups'] },
    ar: { title: 'المرحلة 2: التقوية والتحكم العصبي العضلي',
      next: ['مدى حركة كامل تقريبًا', 'مفيش تورم بعد التمرين', 'قوة الفخذ قريبة من الرجل السليمة حسب قياس العيادة', 'تحكم كويس في الركبة في نص القرفصاء والطلوع على الدرجة'] },
    de: { title: 'Phase 2: Kraft und neuromuskuläre Kontrolle',
      next: ['Nahezu volles Bewegungsausmaß', 'Keine Schwellung nach dem Training', 'Oberschenkelkraft nahe der gesunden Seite (Praxistest)', 'Gute Kniekontrolle bei Mini-Kniebeugen und Aufsteigen'] },
  },
};
export const phaseText = (n, lang) => PHASES[n]?.[lang] ?? PHASES[n]?.en;
