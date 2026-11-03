# Jak czytać każdą liczbę w Dachy Miasta

W aplikacji otwórz „Jak czytać” lub wybierz `?` przy wyniku. Zobaczysz także obliczenie wybranego dachu z bieżącymi parametrami. Poniżej ten sam słownik dostępny bez uruchamiania aplikacji.

## Jednostki: m², kWp, kWh, MWh

m² to powierzchnia. kWp to moc znamionowa modułów w warunkach standardowych. kW to moc w danej chwili, kWh — energia w okresie. Prognoza roczna i energia dnia w symulacji dotyczą innych okresów.

Wzór / reguła:

```text
1 MWh = 1 000 kWh; 1 kWh = 1 000 Wh; 1 kW = 1 000 W
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Mapa, numery i kolory

Obrys to rzut budynku z MSIP, nie układ modułów. Czerwone z numerami to plan, według malejącej prognozy rocznej. Niebieskie spełniają filtry, szare nie. Kliknięcie otwiera kartę, ale nie dodaje dachu do planu. Fioletowy znacznik to dach szkicu PV.

Wzór / reguła:

```text
1, 2, 3… = rank(Eᵢ), E₁ ≥ E₂ ≥ E₃
```

Źródło: [MSIP · MONIT-AIR](https://msip.um.krakow.pl/arcgis/rest/services/MONIT-AIR/WS_MA_Potencal_solarny_dachow/MapServer/0).

## Roczna produkcja planu

Suma prognozy rocznej wybranych dachów. To wynik modelu, nie odczyt licznika. Zmiana parametrów lub filtrów uruchamia dobór od nowa.

Wzór / reguła:

```text
Eplan [MWh/rok] = Σ Eᵢ [kWh/rok] / 1 000
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Nakłady i pozostały budżet

Jednorazowe nakłady wybranych instalacji według wpisanych przez Ciebie cen. Podatki, wzmocnienie dachu, eksploatacja, finansowanie, magazyn i przyłącze nie są liczone osobno. Pozostały budżet to budżet minus nakłady.

Wzór / reguła:

```text
Cplan = Σ (Pᵢ × c + Cfixed); remaining = B − Cplan
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Liczby: pilotaż, kandydaci i plan

927 to obiekty pilotażu badawczego, nie wszystkie dachy Krakowa. Kandydaci spełniają aktywne filtry; dostępne finansowo mają też dodatnią produkcję i pojedynczo mieszczą się w budżecie. Działki miasta i adresy liczymy wśród dachów planu.

Wzór / reguła:

```text
Nplan = selectedIds.length; Ncandidates = candidates.length
```

Źródło: [roofs.json · krakow-all-in-one.html](./data/roofs.json).

## Szacunek CO₂

Prognoza roczna × wskaźnik sieci: domyślnie 553 kg CO₂/MWh (KOBiZE, dane za 2024 r., publikacja 12.2025). To zastąpienie energii z sieci, bez cyklu życia modułów. Zapisany własny wskaźnik nie zmienia się automatycznie.

Wzór / reguła:

```text
CO₂ [t/rok] = E [kWh/rok] / 1 000 × f [kg/MWh] / 1 000
```

Źródło: [KOBiZE · 12.2025 · 2024](https://www.kobize.pl/uploads/materialy/materialy_do_pobrania/aktualnosci/2025/142_Wskazniki_emisyjnosci_2025.pdf).

## Nakłady na jednostkę prognozy rocznej

Jednorazowe nakłady na 1 MWh prognozy rocznej, w zł/(MWh/rok). Służy do porównania wariantów. To nie LCOE ani okres zwrotu: lata pracy i eksploatacja nie są uwzględnione.

Wzór / reguła:

```text
Cplan / (Eplan / 1 000)
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Powierzchnia budynku i obrysu

powbudynku to pole budynku z MONIT-AIR. Dla kontroli liczymy pole obrysu w lokalnej płaszczyźnie metrycznej (elipsoida WGS84) bez otworów. To rzut poziomy, nie suma kondygnacji ani pole połaci.

Wzór / reguła:

```text
Aoutline ≈ Σ polygon outer areas − Σ holes [m²]
```

Źródło: [MSIP · MONIT-AIR](https://msip.um.krakow.pl/arcgis/rest/services/MONIT-AIR/WS_MA_Potencal_solarny_dachow/MapServer/0).

## Powierzchnia użyteczna ze źródła

Do obliczeń bierzemy powuzytecz zaokrąglone w źródłowym HTML do pełnego m²; wszystkie 927 wartości porównano z zapisanym MSIP. Wszędzie powuzytecz ≈ 79,9% powbudynku; reguły tej redukcji nie potwierdzono. Nie zwiększano jej według zdjęć ani kondygnacji.

Wzór / reguła:

```text
A = round(MSIP.powuzytecz), |ΔA| ≤ 0,5 m²
```

Źródło: [Kontrola 2026-10-28](./data/source-audit.json).

## Powierzchnia modułów po ograniczeniu

Bierzemy wybrany udział powierzchni użytecznej i zmniejszamy go, gdy działa limit mocy: przy sprawności 20% limit 150 kWp to 750 m² modułów. Odsunięć, przejść i mocowań nie projektujemy. 79,9% źródła i nasze 60% to dwie osobne redukcje.

Wzór / reguła:

```text
Apanels = A × coverage × scale = P / (η × 1 kW/m²)
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Promieniowanie: średnia i suma

sredniepc to średnie roczne promieniowanie na m² według modelu źródła, sumapc — cała padająca energia słoneczna w roku. To jeszcze nie prąd. Do obliczeń bierzemy sumapc; zaokrąglona średnia × powierzchnia może się od niej nieco różnić.

Wzór / reguła:

```text
Gsource = sredniepc [kWh/m²/rok]; S = sumapc [kWh/rok]
```

Źródło: [MSIP · MONIT-AIR](https://msip.um.krakow.pl/arcgis/rest/services/MONIT-AIR/WS_MA_Potencal_solarny_dachow/MapServer/0).

## Moc: potencjał i scenariusz

Moc przed limitem to pole modułów × sprawność przy natężeniu odniesienia 1 kW/m². Wynik to mniejsza z tej mocy i wybranego limitu. To moc modułów DC, nie falownika AC ani przyłącza.

Wzór / reguła:

```text
P₀ = A × coverage × η; P = min(P₀, limit), scale = P/P₀; limit=0 → P=P₀
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Roczna prognoza jednego dachu

Padającą energię słoneczną mnożymy przez udział powierzchni, sprawność, PR i skalę ograniczenia. Zakładamy, że zajęta część dachu dostaje średnie promieniowanie. Bez układu modułów i zmierzonej pogody błąd może iść w obie strony.

Wzór / reguła:

```text
E [kWh/rok] = S × coverage × η × PR × scale
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Uzysk jednostkowy

Roczna prognoza na 1 kWp: (sumapc / zaokrąglona powierzchnia użyteczna) × PR. Pole sredniepc może dać nieco inną wartość. Limit zmniejsza moc i energię w tej samej proporcji, więc stosunek się nie zmienia.

Wzór / reguła:

```text
Y [kWh/kWp/rok] = E/P = (S/A) × PR
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Porównanie z PVGIS

Średnią MONIT-AIR dzielimy przez 1 140,9 kWh/m²/rok — zapisany poziomy przykład PVGIS dla centrum Krakowa. Modele i okresy są różne, więc to nie procent cienia. Zgodność około 2% w jednym przykładzie to jeszcze nie kalibracja.

Wzór / reguła:

```text
index [%] = 100 × sredniepc / PVGIS.Ghorizontal
```

Źródło: [JRC · PVGIS 5.2 · 2026-10-26](./data/pvgis-reference.json).

## Budżet

Górny limit jednorazowych nakładów. 5 w polu to 5 mln zł. Domyślne 5 mln to założenie demonstracyjne, nie zatwierdzony budżet miasta. Dach wchodzi całą instalacją; reszta budżetu nie finansuje części kolejnej.

Wzór / reguła:

```text
B [zł] = input × 1 000 000; Σ Cᵢ ≤ B
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Udział powierzchni pod moduły

Ustawiasz Ty: domyślnie 60% powierzchni użytecznej, nie całego budynku. To założenie scenariusza, nie reguła MSIP. Przy limicie mocy efektywny udział może być mniejszy — widać go w obliczeniu dachu.

Wzór / reguła:

```text
coverage = input[%]/100; effective coverage = coverage × scale
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Sprawność modułów

Domyślnie 20%, bez wybranego modelu modułu. Określa moc na m² i część energii słonecznej zamienianej na prąd. Straty całej instalacji opisuje PR, nie sprawność.

Wzór / reguła:

```text
η = input[%]/100; Pdensity = η × 1 kW/m²
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## PR: współczynnik systemowy

Domyślnie 80% = 0,8: po sprawności zostaje 80%, a 20% to umowne straty falownika, temperatury, przewodów i inne. To założenie, nie pomiar; nachylenia i cienia nie liczymy na nowo.

Wzór / reguła:

```text
PR = input[%]/100; E = EbeforePR × PR
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Limit mocy: 150, 50 lub bez limitu

Wybrany rozmiar instalacji na budynek. 150 kWp rozkłada budżet na więcej dachów, 0 wyłącza limit. Progi 6,5 / 50 / 150 kW służą wstępnemu grupowaniu procedur; moc w sensie prawnym, ochronę, przyłącze i projekt sprawdza się osobno.

Wzór / reguła:

```text
P = limit > 0 ? min(P₀, limit) : P₀
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Cena za kWp

Domyślnie 4 000 zł za kWp — cena scenariusza, nie oferta rynkowa. Stosujemy ją do mocy po limicie. Zakres ceny, VAT i data oferty nie są określone.

Wzór / reguła:

```text
Cvariable = P × c [zł/kWp]
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Koszt stały

Domyślnie 15 000 zł na każdą wybraną instalację: raz na budynek, niezależnie od mocy. To umowny dodatek, nie potwierdzony koszt projektu i przyłącza.

Wzór / reguła:

```text
Cᵢ = round((Pᵢ × c + Cfixed) × 100) / 100
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Minimalna moc

Domyślnie 3 kWp. Mniejsze instalacje nie biorą udziału w doborze. To próg scenariusza, nie ograniczenie techniczne.

Wzór / reguła:

```text
candidate only if P ≥ Pmin
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Minimalny uzysk jednostkowy

0 wyłącza filtr. Dodatnia wartość pomija dachy o niższym E/P. Porównujemy prognozę modelu, nie zmierzoną wydajność.

Wzór / reguła:

```text
Ymin = 0 → off; otherwise E/P ≥ Ymin
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Wskaźnik sieci

Pole można zmienić. 553 to wartość bazowa według KOBiZE 12.2025 (dane za 2024 r.); dawne 597 dotyczy danych za 2023 r. To CO₂ sieci, nie pełny cykl życia CO₂e.

Wzór / reguła:

```text
f [kg CO₂/MWh]; result = E/1 000 × f/1 000 [t]
```

Źródło: [KOBiZE · 12.2025 · 2024](https://www.kobize.pl/uploads/materialy/materialy_do_pobrania/aktualnosci/2025/142_Wskazniki_emisyjnosci_2025.pdf).

## Filtry działek, EGiB i ochrony

Działki miasta to gmina, współwłasność gminy i powiat grodzki; nie wskazuje to właściciela ani zarządcy budynku. EGiB to dopasowanie ID w zapisanej ewidencji, brak nie oznacza rozbiórki. Ochrona (UNESCO, park kulturowy) wymaga oceny. Flagi zieleni i inwestycji pochodzą z pilotażu.

Wzór / reguła:

```text
Neligible = count(all active filters pass); unknown ≠ verified
```

Źródło: [MSIP · snapshot 2026-10-26](./data/roof-registers.json).

## Adres, odległość i numer działki

649 adresów to kandydaci: 254 punkty w obrysie i 395 najbliższych do 30 m od krawędzi; 278 dachów bez adresu. Dzielnica może pochodzić z punktu do 500 m. Działkę i obręb odczytujemy z ID budynku; numer budynku w ID to nie numer uliczny.

Wzór / reguła:

```text
address: inside OR distance ≤ 30 m; district fallback ≤ 500 m
```

Źródło: [MSIP · snapshot 2026-10-26](./data/roof-context.json).

## Liczniki sprawdzeń i rejestrów

Liczniki karty to automatyczne stany siedmiu kontroli: geometria, EGiB, adres, działka, własność, ochrona, PV. Liczby rejestrów to dopasowania pól w pilotażu; kategorie ochrony mogą się nakładać. OZE na działce lub obok nie oznacza PV na tym dachu.

Wzór / reguła:

```text
Ncategory = count(matched field); union ≠ sum(overlapping categories)
```

Źródło: [MSIP · snapshot 2026-10-26](./data/roof-registers.json).

## Daty, wersja i dokładność

Atlas 2016 to nazwa historycznego zbioru, nie data pomiaru każdego dachu. Zapis słoneczny pobrano 25.10.2026, adresy i rejestry 26.10.2026. Miejsca po przecinku to zaokrąglenie, nie dokładność pomiaru. 25 wierszy na stronie i kolejka 15 obiektów to ustawienia interfejsu.

Wzór / reguła:

```text
retrievedAt ≠ surveyDate; displayed value = rounded calculation
```

Źródło: [Kontrola 2026-10-28](./data/source-audit.json).

## Progi procedur i liczba instalacji

Grupy mocy: ≤6,5; >6,5–50; >50–150; >150 kWp. Według ogólnych reguł powyżej 6,5 kW potrzebne są uzgodnienie ppoż. i zawiadomienie PSP; 50 kW to granica mikroinstalacji, 150 kW — ogólny próg budowlany. Ochronę i przyłącze sprawdza się osobno.

Wzór / reguła:

```text
Nclass = count(P within class); Σ Nclass = Nplan
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Trzy strategie i poprawa

Ci sami kandydaci i budżet, trzy strategie: najpierw największe E, najpierw najlepsze E/C oraz programowanie dynamiczne z zaokrągleniem kosztów. Pokazujemy najlepszy wynik; globalnego optimum nie dowodzimy. Poprawę liczymy względem pierwszej, zachłannej strategii.

Wzór / reguła:

```text
gain [%] = 100 × (Ebest / Elargest − 1)
```

Źródło: [Zasady doboru](./DATA_SOURCES.md).

## Luka i krok zaokrąglenia

Górna granica pozwala brać części instalacji, czego plan nie robi. Luka to maksymalna możliwa poprawa w tym samym modelu, nie błąd prognozy słonecznej. W DP koszt zaokrąglamy w górę; końcowe nakłady liczymy z dokładnych kosztów w groszach.

Wzór / reguła:

```text
gap = 100 × (Eupper − Ebest)/Eupper; step = max(0,01 zł, ceil(B×100/5000)/100)
```

Źródło: [Zasady doboru](./DATA_SOURCES.md).

## Scenariusze ±20% i stabilne dachy

Koszt +20%: cena jednostkowa i stała × 1,2. Produkcja −20%: PR × 0,8. W każdym przypadku dobieramy dachy od nowa przy tym samym budżecie — to scenariusze testowe, nie przedział ufności. Stabilne dachy są wybrane we wszystkich trzech przypadkach.

Wzór / reguła:

```text
stable = |IDsbase ∩ IDscost ∩ IDsyield|
```

Źródło: [Zasady doboru](./DATA_SOURCES.md).

## Krzywa budżetu, udziały i zapisane warianty

Każdy punkt krzywej to dobór przy innym budżecie i tych samych parametrach; nachylenie to MWh/rok z kolejnego miliona zł. Udział największego dachu to jego E / E planu, powyżej 30% — ostrzeżenie. Do czterech wariantów zapisujemy lokalnie, bez przeliczania.

Wzór / reguła:

```text
marginal = Δ(E/1000) / Δ(B/1e6); share = 100 × Eᵢ / ΣE
```

Źródło: [Zasady doboru](./DATA_SOURCES.md).

## Moduły i szkic przestrzenny

Obrys i otwory pochodzą z MSIP. Założenia: płaski dach na 6 m, moduł 2 × 1 m, początkowe odsunięcie 0,5 m, prześwit rzędów 0,8 m (można zmienić lub dobrać). Moduły leżą w całości w obrysie, ich pole nie przekracza pola z „Planu”. Kamera zmienia tylko widok.

Wzór / reguła:

```text
N ≤ floor(Apanels / 2 m²); Psketch = N × 2 m² × η × 1 kW/m²
```

Źródło: [MSIP · PV sketch](./SIMULATION.md).

## Nachylenie, kierunek i porównanie

Nachylenie od poziomu (0° płasko), azymut: 0° północ, 90° wschód, 180° południe, 270° zachód. Tabela porównuje 1 kWp przy 0/15/30/45/60° i Pn/Wsch/Pd/Zach plus bieżący wariant, bez dodatkowego cienia i śniegu, z bieżącym prześwitem rzędów. Zimą i latem najlepszy wariant może być inny.

Wzór / reguła:

```text
Gpoa = DNI × max(0, cos(incidence)) + DHI × (1+cos β)/2 + GHI × 0.2 × (1−cos β)/2
```

Źródło: [PVGIS 5.3 · TMY · Kraków](./data/krakow-climate.json).

## Pogoda Krakowa, pory roku i P10/P50/P90

PVGIS 5.3: 8 760 godzin roku typowego dla centrum Krakowa (promieniowanie SARAH3, temperatura i wiatr ERA5, 2005–2023; miesiące z różnych lat). Dni miesiąca szeregujemy według promieniowania względem nieba bezchmurnego (Haurwitz); P10/P50/P90 to 10/50/90 percentyl. Śnieg i dodatkowy cień ustawiasz sam; śnieg tylko od listopada do marca.

Wzór / reguła:

```text
weather day = percentile(month days, ΣGHI / ΣGclear); Gused = (Gpoa − Gbeam × frow) × (1−shade/100) × (1−snow/100, XI–III only)
```

Źródło: [PVGIS 5.3 · TMY · Kraków](./data/krakow-climate.json).

## Cień między rzędami

Przedni rząd zacienia dolny pas następnego, gdy słońce jest nisko. Udział pasa liczymy co godzinę z nachylenia, rozstawu rzędów i wysokości słońca (Appelbaum & Bany, 1979); cień usuwa składową bezpośrednią na modułach, przed którymi stoi rząd. Wskaźnik to udział energii rocznej utracony przez rzędy. Pod suwakiem prześwitu podano prześwit dający straty ≤ 1%, ale wtedy może zmieścić się mniej modułów.

Wzór / reguła:

```text
pitch = 2 m × cos β + gap; frow = clamp(1 − pitch × sin αp / (2 m × sin(αp + β)), 0, 1); tan αp = tan(elevation) / cos(γsun − γmodule); loss = 1 − E / Eno rows
```

Źródło: [PVGIS 5.3 · TMY · Kraków](./data/krakow-climate.json).

## Najlepszy wariant dachu

„Znajdź maksimum energii” sprawdza około 70 kombinacji nachylenia (0–60°), kierunku (południe ±45°) i prześwitu (0,3–6 m). W każdej moduły są rozmieszczane od nowa, więc liczą się i liczba mieszczących się modułów, i cień rzędów. Wybieramy wariant z największą energią w roku; szkic zmienia się po „Zastosuj”. Na sprawdzonych dachach wynik zgodził się z pełnym przeszukaniem do 0,1 MWh. Gwiazdka w tabeli orientacji to najlepszy wynik na 1 kWp, bez liczby modułów.

Wzór / reguła:

```text
best = argmax E_year(tilt, azimuth, gap): grid tilt {0…60°} × gap {0.3…6 m} facing 180°, then 135°/225° and a local refinement; E_year uses the fitted module count and row shading
```

Źródło: [PVGIS 5.3 · TMY · Kraków](./data/krakow-climate.json).

## Obliczenie mocy i temperatury

Moc liczymy co godzinę z liczby modułów, kątów, słońca, temperatury i wiatru. Temperatura modułu według Faimana (U0=25, U1=6,84), wiatr ERA5 na wysokości 10 m. Współczynnik −0,4%/°C i straty 14% to typowe założenia. Wyjście nie przekracza mocy znamionowej; cień rzędów jest uproszczony, falownika nie modelujemy osobno.

Wzór / reguła:

```text
Tmodule = Tair + Gused/(25 + 6.84 × wind); P = min(Pnom, Pnom × Gused/1000 × max(0,1−0.004×(Tmodule−25)) × 0.86)
```

Źródło: [Faiman · pvlib](https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.temperature.faiman.html).

## Energia godziny, dnia, miesiąca i roku

Energia dnia to suma 24 godzin, miesiąca — jego godzin, roku — wszystkich 8 760 godzin TMY; w obrębie godziny moc jest stała. „Do chwili” to początek dnia plus część bieżącej godziny. P10/P50/P90 zmieniają przykład dnia, nie rok. Zmiana parametrów przelicza wszystko.

Wzór / reguła:

```text
E [kWh] ≈ Σ(P [W] × Δt [h])/1000; year = Σ8760 hours; month = Σmonth hours
```

Źródło: [PVGIS 5.3 · TMY · Kraków](./data/krakow-climate.json).

## Czas i odtwarzanie doby

Czas to Europe/Warsaw, z czasem letnim wybranego dnia. Przykład ma pełne 24 godziny, dni zmiany czasu nie są wybierane; rok zachowuje wszystkie 8 760 godzin. Pozycja słońca uwzględnia przesunięcie PVGIS 0,1811 godziny. Prędkość odtwarzania nie zmienia energii dobowej.

Wzór / reguła:

```text
Δtplayback = Δtreal × speed; solar time = UTC timestamp + irradiance_time_offset
```

Źródło: [PVGIS 5.3 · TMY · Kraków](./data/krakow-climate.json).

## Źródła szkicu i różnica względem „Planu”

Geometria to obrys MSIP, klimat — zapisany TMY PVGIS, parametry — Twój scenariusz. Promieniowanie MONIT-AIR służy tylko do doboru dachów, więc wynik może różnić się od „Planu”. JSON zapisuje źródło, lata, wymiary i współrzędne modułów, parametry i miesiące.

Wzór / reguła:

```text
MSIP footprint + user layout + PVGIS TMY → separate configuration scenario
```

Źródło: [PVGIS 5.3 · TMY · Kraków](./data/krakow-climate.json).
