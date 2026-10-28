# Jak czytać każdą liczbę w Dachy Miasta

W aplikacji otwórz „Jak czytać” lub wybierz `?` przy wyniku. Zobaczysz także obliczenie wybranego dachu z bieżącymi parametrami. Poniżej ten sam słownik dostępny bez uruchamiania aplikacji.

## Jednostki: m², kWp, kWh, MWh

m² to powierzchnia. kWp to moc znamionowa modułów w warunkach standardowych, a nie stała produkcja. kW to moc chwilowa; kWh to energia w okresie. Prognoza roczna i energia z 90 sekund dotyczą innych okresów.

Wzór / reguła:

```text
1 MWh = 1 000 kWh; 1 kWh = 1 000 Wh; 1 kW = 1 000 W
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Mapa, numery i kolory

Obrys to rzut budynku z MSIP, nie układ modułów. Czerwone dachy i numery to wybrany plan, uporządkowany według prognozy rocznej. Niebieskie spełniają filtry; szare ich nie spełniają. Kliknięcie wybiera kartę, ale nie dodaje dachu do planu. Fioletowy znacznik oznacza symulację, osobny niebieski — importowaną instalację PV.

Wzór / reguła:

```text
1, 2, 3… = rank(Eᵢ), E₁ ≥ E₂ ≥ E₃
```

Źródło: [MSIP · MONIT-AIR](https://msip.um.krakow.pl/arcgis/rest/services/MONIT-AIR/WS_MA_Potencal_solarny_dachow/MapServer/0).

## Roczna produkcja planu

Suma modelowanej energii elektrycznej wyłącznie wybranych dachów w roku. To prognoza, nie odczyt licznika ani gwarantowana oszczędność. Zmiana parametrów lub filtrów uruchamia dobór ponownie.

Wzór / reguła:

```text
Eplan [MWh/rok] = Σ Eᵢ [kWh/rok] / 1 000
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Nakłady i pozostały budżet

Jednorazowe nakłady wybranych instalacji według wpisanych cen, nie kosztorys dostawcy. Podatki, wzmocnienie dachu, eksploatacja, finansowanie, magazyn i przyłącze nie są wyceniane osobno. Pozostały budżet to budżet minus suma kosztów.

Wzór / reguła:

```text
Cplan = Σ (Pᵢ × c + Cfixed); remaining = B − Cplan
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Liczby: pilotaż, kandydaci i plan

927 to obiekty pilotażu badawczego, nie wszystkie dachy Krakowa. Kandydaci spełniają aktywne filtry; dostępne finansowo mają dodatnią produkcję i pojedynczo mieszczą się w budżecie. Plan obejmuje wybrany zestaw. Działki miasta i znalezione adresy są liczone wśród wybranych dachów.

Wzór / reguła:

```text
Nplan = selectedIds.length; Ncandidates = candidates.length
```

Źródło: [roofs.json · krakow-all-in-one.html](./data/roofs.json).

## Szacunek CO₂

Prognoza roczna jest mnożona przez wybrany wskaźnik sieci. Domyślnie 553 kg CO₂/MWh: KOBiZE, dane za 2024 r., publikacja 12.2025. To scenariusz zastąpienia energii sieciowej, bez cyklu życia modułów; efekt nie jest zmierzony. Zapisany wskaźnik użytkownika nie jest automatycznie zmieniany.

Wzór / reguła:

```text
CO₂ [t/rok] = E [kWh/rok] / 1 000 × f [kg/MWh] / 1 000
```

Źródło: [KOBiZE · 12.2025 · 2024](https://www.kobize.pl/uploads/materialy/materialy_do_pobrania/aktualnosci/2025/142_Wskazniki_emisyjnosci_2025.pdf).

## Nakłady na jednostkę prognozy rocznej

Jednorazowe nakłady dzielimy przez roczną prognozę w MWh. To wskaźnik porównawczy w zł/(MWh/rok). Nie jest ceną sprzedaży prądu, okresem zwrotu ani LCOE: nie uwzględnia lat pracy i eksploatacji.

Wzór / reguła:

```text
Cplan / (Eplan / 1 000)
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Powierzchnia budynku i obrysu

powbudynku to pole budynku z MONIT-AIR. Niezależne sprawdzenie obrysu używa lokalnej płaszczyzny metrycznej z parametrami elipsoidy WGS84 i odejmuje otwory. To rzut poziomy, nie suma powierzchni kondygnacji, pole połaci ani zmierzona powierzchnia modułów.

Wzór / reguła:

```text
Aoutline ≈ Σ polygon outer areas − Σ holes [m²]
```

Źródło: [MSIP · MONIT-AIR](https://msip.um.krakow.pl/arcgis/rest/services/MONIT-AIR/WS_MA_Potencal_solarny_dachow/MapServer/0).

## Powierzchnia użyteczna ze źródła

Do obliczeń zachowujemy powuzytecz zaokrąglone w źródłowym HTML do pełnego m². Wszystkie 927 wartości porównano z zapisanym MSIP. W każdej pozycji powuzytecz ≈ 79,9% powbudynku; reguła tej redukcji nie została potwierdzona. To powierzchnia modelowa, nie inwentaryzacja wolnego miejsca. Nie zwiększano jej ze zdjęć ani liczby kondygnacji.

Wzór / reguła:

```text
A = round(MSIP.powuzytecz), |ΔA| ≤ 0,5 m²
```

Źródło: [Kontrola 2026-10-28](./data/source-audit.json).

## Powierzchnia modułów po ograniczeniu

Najpierw bierzemy wybrany udział powierzchni użytecznej, następnie zmniejszamy go, jeśli działa limit mocy. Przy sprawności 20% limit 150 kWp odpowiada 750 m² modułów. Nie projektujemy odsunięć, przejść, mocowań ani układu; źródłowe 79,9% i nasz udział 60% to dwa osobne etapy redukcji.

Wzór / reguła:

```text
Apanels = A × coverage × scale = P / (η × 1 kW/m²)
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Promieniowanie: średnia i suma

sredniepc to średnie roczne promieniowanie modelu źródłowego; sumapc to suma padającej energii słonecznej. To jeszcze nie prąd. Do produkcji stosujemy sumapc bezpośrednio. Iloczyn zaokrąglonej średniej i powierzchni nie musi dokładnie odtwarzać sumapc: to osobne pola zagregowanego źródła.

Wzór / reguła:

```text
Gsource = sredniepc [kWh/m²/rok]; S = sumapc [kWh/rok]
```

Źródło: [MSIP · MONIT-AIR](https://msip.um.krakow.pl/arcgis/rest/services/MONIT-AIR/WS_MA_Potencal_solarny_dachow/MapServer/0).

## Moc: potencjał i scenariusz

Moc przed limitem wynika z powierzchni modułów i sprawności przy natężeniu odniesienia 1 kW/m². Wynik to mniejsza z mocy potencjalnej i limitu. To scenariusz mocy modułów DC, nie potwierdzona moc falownika AC ani przyłącza.

Wzór / reguła:

```text
P₀ = A × coverage × η; P = min(P₀, limit), scale = P/P₀; limit=0 → P=P₀
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Roczna prognoza jednego dachu

Padającą energię słoneczną mnożymy przez udział powierzchni, sprawność, współczynnik systemowy PR i skalę ograniczenia mocy. Zakładamy proporcjonalny udział promieniowania na zajętej części. Bez układu modułów i zmierzonej pogody nie znamy z góry znaku błędu prognozy.

Wzór / reguła:

```text
E [kWh/rok] = S × coverage × η × PR × scale
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Uzysk jednostkowy

Roczna prognoza na 1 kWp. Dokładny wzór aplikacji to (sumapc / zaokrąglona powierzchnia użyteczna) × PR; pole sredniepc może się różnić. Limit skaluje moc i energię proporcjonalnie, więc stosunek pozostaje stały.

Wzór / reguła:

```text
Y [kWh/kWp/rok] = E/P = (S/A) × PR
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Porównanie z PVGIS

Średnią MONIT-AIR dzielimy przez 1 140,9 kWh/m²/rok z zapisanego poziomego przykładu PVGIS w centrum Krakowa. To porównanie różnych modeli i okresów, nie procent zacienienia ani kontrola dokładności konkretnego dachu. Zgodność około 2% w jednym przykładzie nie jest kalibracją.

Wzór / reguła:

```text
index [%] = 100 × sredniepc / PVGIS.Ghorizontal
```

Źródło: [JRC · PVGIS 5.2 · 2026-10-26](./data/pvgis-reference.json).

## Budżet

Twój górny limit jednorazowych nakładów. Wartość 5 oznacza 5 milionów zł, nie 5 zł. Domyślne 5 mln to założenie demonstracyjne, nie zatwierdzony budżet miasta. Wybieramy całe instalacje według scenariusza; reszta budżetu nie finansuje dodatkowej części instalacji.

Wzór / reguła:

```text
B [zł] = input × 1 000 000; Σ Cᵢ ≤ B
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Udział powierzchni pod moduły

Wpis użytkownika: domyślnie 60% powierzchni już użytecznej, nie całego budynku. To dodatkowe założenie, nie reguła MSIP. Przy limicie mocy efektywny udział może być mniejszy; pokazuje go obliczenie dachu.

Wzór / reguła:

```text
coverage = input[%]/100; effective coverage = coverage × scale
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Sprawność modułów

Domyślnie 20%, założenie bez wybranego modelu modułu. Określa moc znamionową na m² i konwersję energii słonecznej na elektryczną. Nie jest to PR ani łączna strata całej instalacji.

Wzór / reguła:

```text
η = input[%]/100; Pdensity = η × 1 kW/m²
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## PR: współczynnik systemowy

Domyślnie 80% = 0,8: zachowujemy 80% wyniku po sprawności, dodatkowe umowne straty to 20%. Założenie obejmuje falownik, temperaturę, przewody i inne czynniki, nie jest pomiarem. Nie dodaje nowego obliczenia nachylenia lub cienia.

Wzór / reguła:

```text
PR = input[%]/100; E = EbeforePR × PR
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Limit mocy: 150, 50 lub bez limitu

To wybrany rozmiar instalacji na budynek. 150 kWp rozkłada budżet na więcej dachów. Progi 6,5 / 50 / 150 kW służą wstępnemu grupowaniu procedur; moc DC nie zastępuje definicji prawnej, oceny ochrony, przyłącza i projektu. 0 wyłącza limit.

Wzór / reguła:

```text
P = limit > 0 ? min(P₀, limit) : P₀
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Cena za kWp

Domyślnie 4 000 zł za kWp: cena scenariusza, nie oferta rynkowa. Stosujemy ją do mocy po limicie. Zakres ceny, VAT i data oferty nie są określone.

Wzór / reguła:

```text
Cvariable = P × c [zł/kWp]
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Koszt stały

Domyślnie 15 000 zł na każdą wybraną instalację. Dodajemy raz na budynek niezależnie od mocy. To umowny dodatek, nie potwierdzony koszt projektu i przyłącza.

Wzór / reguła:

```text
Cᵢ = round((Pᵢ × c + Cfixed) × 100) / 100
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Minimalna moc

Domyślnie 3 kWp. Mniejsze instalacje nie uczestniczą w doborze. To próg scenariusza, nie stwierdzenie technicznej niemożliwości mniejszych instalacji.

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

Pole edytowalne. 553 to zaktualizowane założenie według KOBiZE 12.2025, dane 2024. Dawne 597 dotyczy danych 2023. CO₂ nie oznacza pełnego cyklu życia CO₂e.

Wzór / reguła:

```text
f [kg CO₂/MWh]; result = E/1 000 × f/1 000 [t]
```

Źródło: [KOBiZE · 12.2025 · 2024](https://www.kobize.pl/uploads/materialy/materialy_do_pobrania/aktualnosci/2025/142_Wskazniki_emisyjnosci_2025.pdf).

## Filtry działek, EGiB i ochrony

Działki miasta obejmują gminę, współwłasność gminy i powiat grodzki; nie ustala to właściciela ani zarządcy budynku. EGiB oznacza dopasowanie identyfikatora w zapisanej ewidencji; brak nie dowodzi rozbiórki. Sygnały ochrony wymagają oceny; UNESCO lub park kulturowy nie dowodzą konkretnego obowiązku pozwolenia. Flagi zieleni i inwestycji pochodzą z pilotażu i nie potwierdzają PV.

Wzór / reguła:

```text
Neligible = count(all active filters pass); unknown ≠ verified
```

Źródło: [MSIP · snapshot 2026-10-26](./data/roof-registers.json).

## Adres, odległość i numer działki

649 adresów to kandydaci: 254 punkty w obrysie i 395 najbliższych do 30 m od krawędzi. Pozostałe 278 bez adresu. Dzielnica może pochodzić z punktu do 500 m. Działkę i obręb odczytujemy z ID budynku. Numer budynku w ID nie jest numerem ulicznym.

Wzór / reguła:

```text
address: inside OR distance ≤ 30 m; district fallback ≤ 500 m
```

Źródło: [MSIP · snapshot 2026-10-26](./data/roof-context.json).

## Liczniki sprawdzeń i rejestrów

Liczniki karty to automatyczne stany siedmiu kontroli: geometria, EGiB, adres, działka, własność, ochrona, PV. Nie oznaczają siedmiu ukończonych oględzin. Zbiorcze liczby to dopasowania pól w pilotażu; kategorie ochrony mogą się nakładać. OZE na tej samej działce lub obok nie oznacza PV na tym dachu.

Wzór / reguła:

```text
Ncategory = count(matched field); union ≠ sum(overlapping categories)
```

Źródło: [MSIP · snapshot 2026-10-26](./data/roof-registers.json).

## Daty, wersja i dokładność

Atlas 2016 to nazwa historycznego zbioru, nie potwierdzona data pomiaru każdego dachu. Zapis słoneczny pobrano 25.10.2026, adresy i rejestry 26.10.2026. Pobranie nie aktualizuje historycznych danych. Współrzędne i miejsca po przecinku nie dowodzą dokładności oględzin. Strony po 25 wierszy i kolejka 15 obiektów to ustawienia interfejsu.

Wzór / reguła:

```text
retrievedAt ≠ surveyDate; displayed value = rounded calculation
```

Źródło: [Kontrola 2026-10-28](./data/source-audit.json).

## Progi procedur i liczba instalacji

Grupujemy moc według progów ≤6,5; >6,5–50; >50–150; >150 kWp. Ogólne reguły powyżej 6,5 kW obejmują uzgodnienie ppoż. i zawiadomienie PSP; 50 kW to granica mikroinstalacji, 150 kW — ogólny próg budowlany. Ochronę i przyłącze sprawdza się osobno. To wskazówka, nie pełna lista decyzji.

Wzór / reguła:

```text
Nclass = count(P within class); Σ Nclass = Nplan
```

Źródło: [Twoje parametry scenariusza](./DATA_SOURCES.md).

## Trzy strategie i poprawa

Porównujemy tych samych kandydatów i budżet: największe E, najlepsze E/C i programowanie dynamiczne z zaokrągleniem kosztów. Pokazujemy najlepszy z trzech wyników, bez dowodu globalnego optimum. Poprawę liczymy tylko względem pierwszej strategii zachłannej.

Wzór / reguła:

```text
gain [%] = 100 × (Ebest / Elargest − 1)
```

Źródło: [Zasady doboru](./DATA_SOURCES.md).

## Luka i krok zaokrąglenia

Górna granica pozwala kupować części instalacji, czego plan nie dopuszcza. Luka ogranicza możliwą poprawę tej samej matematycznej funkcji celu, nie błąd prognozy słonecznej. Koszt w DP zaokrąglamy w górę; końcowe nakłady liczymy z oryginalnych kosztów w groszach.

Wzór / reguła:

```text
gap = 100 × (Eupper − Ebest)/Eupper; step = max(0,01 zł, ceil(B×100/5000)/100)
```

Źródło: [Zasady doboru](./DATA_SOURCES.md).

## Scenariusze ±20% i stabilne dachy

Koszt +20% mnoży cenę jednostkową i stałą przez 1,2. Produkcja −20% mnoży PR przez 0,8. Każdy przypadek uruchamia nowy dobór przy tym samym budżecie; to scenariusze, nie przedział ufności. Stabilne dachy to wspólne ID wszystkich trzech przypadków.

Wzór / reguła:

```text
stable = |IDsbase ∩ IDscost ∩ IDsyield|
```

Źródło: [Zasady doboru](./DATA_SOURCES.md).

## Krzywa budżetu, udziały i zapisane warianty

Punkty krzywej to ponowny dobór przy innym budżecie i tych samych parametrach. Nachylenie oznacza dodatkowe MWh/rok na dodatkowy milion zł. Udział największego dachu to jego E/E planu; ostrzeżenie ponad 30% to reguła interfejsu. Do czterech wariantów zapisujemy lokalnie jako historyczne wyniki, bez automatycznego przeliczenia.

Wzór / reguła:

```text
marginal = Δ(E/1000) / Δ(B/1e6); share = 100 × Eᵢ / ΣE
```

Źródło: [Zasady doboru](./DATA_SOURCES.md).

## Czas wirtualny i prędkość

Zegar pokazuje czas umowny, nie dzisiejszy dzień i pogodę. Start 06:00; po 18:00 produkcja wynosi zero, o 24:00 dzień się kończy. 60 / 300 / 600 / 1800 sekund wirtualnych na rzeczywistą to 1 / 5 / 10 / 30 minut. Pauza, wyjście z ekranu i ukrycie karty zatrzymują naliczanie.

Wzór / reguła:

```text
Δtvirtual = Δtreal × speed; progress = (t−06:00)/(24:00−06:00)
```

Źródło: [Model illustrative-day-v1](./SIMULATION.md).

## Moc i kształt dnia edukacyjnego

Krzywa bazowa to sinusoida od 06:00 do 18:00. Energię dnia ustalamy jako 1/365 prognozy rocznej, ograniczając szczyt mocą instalacji. To nie prognoza sezonowa ani pogodowa. Warunki mnożą moc przez zadane 1 / 0,45 / 0,15 / 0, bez odczytu czujnika.

Wzór / reguła:

```text
Ppeak = min(Pnominal, (Eyear/365) × π/24 h); P(t) = Ppeak × sin(π×(hour−6)/12) × factor
```

Źródło: [Model illustrative-day-v1](./SIMULATION.md).

## Zgromadzona energia wirtualna

Całka z mocy edukacyjnej od startu do wskazanego czasu, według sekund wirtualnych. Zmiana warunków dotyczy przyszłości, nie historii. Zatrzymana instalacja ma zerową moc przy biegnącym zegarze; pauza zatrzymuje oba. Prędkość odtwarzania nie zmienia energii tego samego przedziału wirtualnego.

Wzór / reguła:

```text
E [kWh] = ∫ P(t) [kW] dt [h]
```

Źródło: [Model illustrative-day-v1](./SIMULATION.md).

## Autokonsumpcja i eksport

60% autokonsumpcji to edytowalne założenie, nie profil zużycia budynku. Każdy przyrost energii dzielimy na zużycie własne i eksport; suma równa się produkcji. Zmiana udziału nie przepisuje zgromadzonych przepływów. Nie modelujemy magazynu.

Wzór / reguła:

```text
ΔEself = ΔE × share; ΔEexport = ΔE × (1−share)
```

Źródło: [Model illustrative-day-v1](./SIMULATION.md).

## Ceny i umowny efekt finansowy

W symulatorze 1,00 i 0,30 zł/kWh to ceny edukacyjne zakupu i eksportu, nie taryfy. W monitoringu trzeba je wpisać. Efekt to wartość brutto autokonsumpcji i eksportu, nie zysk netto, zwrot ani rozliczenie net-billing. Zmiana cen przelicza całą zgromadzoną energię.

Wzór / reguła:

```text
value [zł] = Eself [kWh] × buyRate + Eexport [kWh] × sellRate
```

Źródło: [Model illustrative-day-v1](./SIMULATION.md).

## Zapis dachu, rok i dzień bazowy

Przy tworzeniu kopiujemy ID, parametry, moc i prognozę roczną wybranego dachu. Późniejsze zmiany planu nie zmieniają tej symulacji. Aby zastosować nowe parametry, utwórz ją ponownie. JSON i CSV są oznaczone jako simulation i nie są przyjmowane jako pomiary.

Wzór / reguła:

```text
baselineDay = integral(clear-day curve); target = Eyear/365
```

Źródło: [Model illustrative-day-v1](./SIMULATION.md).

## Zmierzona moc i odczyty V/A

Plik zawiera powerW w watach; stanowisko USB mierzy napięcie i prąd pod obciążeniem i mnoży je. Czas USB nadaje komputer. Plik nie staje się połączeniem na żywo. Po 10 sekundach bez danych moc bieżąca jest nieznana; ostatni odczyt pozostaje historyczny. Przykład edukacyjny jest zawsze sztuczny.

Wzór / reguła:

```text
P [W] = U [V] × I [A]; live only if age ≤ 10 s
```

Źródło: [Zapis JSON / USB](./MONITORING.md).

## Zmierzona energia

Sumujemy trapezy między sąsiednimi odczytami tylko dla odstępów nieprzekraczających limitu. To Wh z pokrytych okresów, nie prognoza roczna. Zero oznacza zmierzony wynik zerowy; kreska — brak danych. Dla stanowiska to energia DC na obciążeniu, nie wyjście miejskiej instalacji AC.

Wzór / reguła:

```text
E [Wh] = Σ ((Pᵢ+Pᵢ₊₁)/2) × Δt [s]/3600
```

Źródło: [Zapis JSON / USB](./MONITORING.md).

## Czas, przerwy i liczba odczytów

Czas to suma zaliczonych odstępów, nie różnica pierwszej i ostatniej daty. Przerwa to para odczytów odległych o więcej niż limit (domyślnie 30 s); jej energii nie uzupełniamy. Liczba odczytów obejmuje wszystkie wiersze, także granice przerw. Daty pokazujemy w strefie przeglądarki.

Wzór / reguła:

```text
Tobserved = Σ Δt where 0 < Δt ≤ maxGap; Ngaps = count(Δt > maxGap)
```

Źródło: [Zapis JSON / USB](./MONITORING.md).

## Zmierzone przepływy i pieniądze

Autokonsumpcję i eksport całkujemy tylko przy obu przepływach na obu końcach każdego zaliczonego odcinka. Efekt finansowy wymaga PV po stronie AC, kompletnych przepływów i obu cen. Nie podstawiamy tu 60% z symulatora. Suma przepływów może być mniejsza od generacji; brakująca część nie jest automatycznie sprzedawana.

Wzór / reguła:

```text
value = Eself/1000 × buyRate + Eexport/1000 × sellRate, E in Wh
```

Źródło: [Zapis JSON / USB](./MONITORING.md).
