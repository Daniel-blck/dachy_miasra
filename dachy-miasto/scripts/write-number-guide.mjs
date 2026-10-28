import fs from 'node:fs/promises';
import { NUMBER_METRICS, NUMBER_SOURCES } from '../src/number-guide.js';

for (const [language, index] of [['ru', 0], ['pl', 1]]) {
  const ru = language === 'ru';
  const parts = [ru ? '# Как читать каждое число в Dachy Miasta' : '# Jak czytać każdą liczbę w Dachy Miasta',
    ru ? 'В интерфейсе откройте «Как читать» или нажмите `?` у показателя. Там дополнительно показан расчёт для выбранной крыши с вашими текущими параметрами. Ниже — тот же справочник, доступный без запуска приложения.' : 'W aplikacji otwórz „Jak czytać” lub wybierz `?` przy wyniku. Zobaczysz także obliczenie wybranego dachu z bieżącymi parametrami. Poniżej ten sam słownik dostępny bez uruchamiania aplikacji.'];
  for (const m of NUMBER_METRICS) {
    const [name, url] = NUMBER_SOURCES[m.source];
    const label = Array.isArray(name) ? name[index] : name;
    parts.push(`## ${m.title[index]}\n\n${m.text[index]}\n\n${ru ? 'Формула / правило' : 'Wzór / reguła'}:\n\n\`\`\`text\n${m.formula}\n\`\`\`\n\n${ru ? 'Источник' : 'Źródło'}: [${label}](${url}).`);
  }
  await fs.writeFile(new URL(`../NUMBERS.${language}.md`, import.meta.url), parts.join('\n\n') + '\n');
}
console.log('Updated NUMBERS.ru.md and NUMBERS.pl.md from the application glossary.');
