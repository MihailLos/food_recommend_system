export function initialRecordForm(record) {
  if (!record) return {};
  const prep = record.preprocessing[0];
  const heating = record.heating[0] ?? prep?.heating[0];
  let analysis;
  let stage;
  for (const [name, part] of [["raw", record], ["preprocessed", prep], ["processed", heating]]) {
    if (part?.analyses.length) {
      analysis = part.analyses[0];
      stage = name;
    }
  }
  return { prep, heating, analysis, stage };
}
