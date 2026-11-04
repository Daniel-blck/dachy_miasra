# Dokumentacja techniczna

**Dachy Miasta · 0.8.1 · 3 listopada 2026 r.**

## 1. Zakres rozwiązania

Aplikacja wspiera wstępny dobór budynków pod PV w ramach budżetu i porównanie szkiców jednej instalacji. Działa na utrwalonych otwartych danych Krakowa oraz PVGIS. Obejmuje widoki Plan, Symulacja, Dane, Jak czytać i Metodyka. Interfejs i eksport z aplikacji są dostępne wyłącznie po polsku. Nie wymaga konta ani własnego API.

Plan dobiera całe instalacje według modelowanej rocznej energii, z ograniczeniem budżetu i filtrami. Symulacja rozmieszcza prostokątne moduły w obrysie MSIP i wyznacza przebiegi na lokalnym klimacie TMY. Są to dwa odrębne modele; edycja szkicu nie zmienia wyniku planu.

## 2. Technologie

| Element | Zastosowanie |
| --- | --- |
| JavaScript ES Modules | Interfejs, model i narzędzia; bez frameworka i pakietów npm |
| Web Worker | Dobór portfela, warianty i krzywa budżetu poza głównym wątkiem |
| Leaflet 1.9.4 | Mapa, obrysy, wybór obiektu, numery planu |
| SVG oraz HTML/CSS | Szkic bryły i modułów, wykresy, responsywny interfejs i druk |
| JSON / GeoJSON | Dane, metadane i archiwum obliczeń |
| localStorage | Parametry, wykluczenia, preferencje i cztery porównania |
| Node.js 22+ | Lokalny HTTP, testy node:test, audyt, aktualizacja danych i pakowanie |
| Chrome DevTools Protocol | Automatyczne kontrole przeglądarkowe i przygotowanie PDF |

Biblioteka Leaflet oraz font Lato są dołączone lokalnie wraz z licencjami. Aplikacja nie wymaga CDN. Podkład OpenStreetMap jest usługą sieciową. Nakładka OZE i przełącznik pokazywania dachów poza kryteriami zostały usunięte. Mapa pokazuje wyłącznie kandydatów spełniających kryteria i wybrane obiekty; pozostałe rekordy są dostępne w tabeli Dane.

## 3. Źródła i przygotowanie danych

### 3.1. Podstawa pilotażu

927 rekordów wyodrębniono z dostarczonego materiału badawczego `krakow-all-in-one.html`. Pola powierzchni i promieniowania porównano z utrwalonym oficjalnym zbiorem MSIP. Zachowane są sumy SHA256 i reguły ekstrakcji. To pilotażowy podzbiór, a nie pełne pokrycie Krakowa ani reprezentatywna próba całego miasta. W utrwalonych metadanych warstwa źródłowa zawiera 118 594 rekordy.

### 3.2. Wykorzystane otwarte zbiory

| Zbiór | Rola w aplikacji | Stan / pobranie |
| --- | --- | --- |
| MONIT-AIR: potencjał solarny dachów | Obrys, identyfikator, promieniowanie, pole budynku i pole użyteczne | Atlas 2016; pobrano 25.10.2026; data nalotu konkretnych rekordów nieustalona |
| MSIP: punkty adresowe | Adres kandydacki i dzielnica | Stan 26.10.2026 |
| MSIP: parki kulturowe | Wstępny sygnał ochrony | Stan 10.06.2026 |
| MSIP: budynki EGiB | Obecność identyfikatora i funkcja budynku | Stan 25.10.2026; pobrano 26.10.2026 |
| MSIP: struktura własności | Grupa własności działki wskazanej przez ID budynku | Stan 05.02.2026; pobrano 26.10.2026 |
| MSIP: zabytki, układy, UNESCO | Sygnały wymagające sprawdzenia | Migawka pobrana 26.10.2026; brak potwierdzenia aktualności każdego obiektu |
| MSIP: OZE | Zapisane wstępne powiązania obiektów z wykazem; bez nakładki mapy | Wykaz OZE 2024; nie jest pomiarem produkcji |
| JRC: PVGIS 5.3 TMY | 8 760 godzin promieniowania, temperatury i wiatru | SARAH3/ERA5, okres 2005–2023; pobrano 28.10.2026 |
| JRC: PVGIS 5.2 | Historyczne porównanie orientacyjne modelu planu | SARAH2, 2005–2020; odrębne od TMY symulacji |
| KOBiZE | Edytowalny współczynnik CO₂: 553 kg/MWh | Publikacja 12.2025, dane za 2024 |

Najważniejsze adresy usług:

- [MONIT-AIR — katalog](https://msip.krakow.pl/dataset/1113) i [warstwa REST](https://msip.um.krakow.pl/arcgis/rest/services/MONIT-AIR/WS_MA_Potencal_solarny_dachow/MapServer/0).
- [Adresy — archiwum JSON](https://msip.um.krakow.pl/Dane/Adresy_JSON.zip) i [parki kulturowe](https://msip.um.krakow.pl/Dane/Parki_kulturowe_JSON.zip).
- [Budynki EGiB](https://msip.um.krakow.pl/arcgis/rest/services/Pobieranie/Budynki/MapServer/0) i [struktura własności](https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/K01_GR_WLASNOSCI/MapServer/0).
- [Rejestr i ewidencja zabytków](https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/zabytki_do_pobrania/MapServer), [obszary ochrony](https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/Zabytki_aprx/MapServer), [OZE](https://msip.krakow.pl/dataset/2842).
- [PVGIS TMY — JRC](https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=50.0614&lon=19.9366&outputformat=json) i [dokumentacja PVGIS](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en).
- [KOBiZE — wskaźniki emisyjności](https://www.kobize.pl/uploads/materialy/materialy_do_pobrania/aktualnosci/2025/142_Wskazniki_emisyjnosci_2025.pdf).

Pełne zapytania, daty, opisy i sumy kontrolne znajdują się w dołączonych plikach danych. Ponowne wykonanie audytu porównuje lokalne migawki; nie oznacza pobrania nowego stanu ani wizji lokalnej. Dane zachowują warunki wykorzystania swoich dostawców; [katalog MSIP](https://msip.krakow.pl/dataset/1113) odsyła do regulaminu MSIP.

### 3.3. Reguły łączenia i niepewność

Obrysy i pola solarne połączono po identyfikatorze budynku: 927/927. `powuzytecz` zaokrąglono do pełnych metrów kwadratowych zgodnie z materiałem referencyjnym. Promieniowanie i średnie wartości źródła zgadzają się dla wszystkich rekordów.

Adres: punkt w obrysie lub najbliższy punkt do 30 m od jego krawędzi. Dopasowano 649 obiektów: 254 wewnątrz i 395 w pobliżu; 278 pozostaje bez adresu. Dzielnica pochodzi z adresu lub najbliższego punktu do 500 m. Dane wejściowe EPSG:2178 przeliczane są do WGS84.

EGiB: zgodny identyfikator dla 773 obiektów. Własność działki: 719 dopasowań, z czego 689 w grupach przyjętych jako ziemia miasta. Numer działki odczytano z identyfikatora budynku; nie wykonano pełnego przecięcia wszystkich działek. Współwłasność jest odróżniona w danych; prawa do budynku i montażu pozostają niepotwierdzone.

Ochrona: punkty zabytków w obrysie lub do 10 m; obszary ochrony według punktów/obrysu opisanych w metadanych. OZE: ten sam numer działki lub odległość do 15 m. Dopasowania są sygnałami, a brak dopasowania nie potwierdza braku ochrony ani instalacji.

## 4. Architektura

Przepływ: **migawki JSON/GeoJSON → połączenie po ID → ocena i filtry → Worker → wyniki i mapa → eksport**. Oddzielnie: **kontur wybranego budynku + TMY → rozmieszczenie modułów → przebiegi godzinowe i SVG → eksport szkicu**.

| Moduł | Odpowiedzialność |
| --- | --- |
| `controller.js` | Wczytanie danych, stan, zdarzenia, komunikacja z Worker, zapis i eksport |
| `views.js`, `simulation-view.js` | Widoki, szczegóły rozwijane, komunikaty i źródła |
| `core/model.js` | Walidacja parametrów, ocena dachu, filtry, sumy i wskaźniki |
| `core/plan.js`, `worker.js` | Spójne obliczenie planu, wrażliwości i krzywej budżetu |
| `core/optimizer.js` | Dwie strategie zachłanne, programowanie dynamiczne i górna granica |
| `core/provenance.js`, `core/review.js` | Ślad obliczeń, audyt źródeł, kolejka weryfikacji |
| `core/climate.js`, `core/layout.js`, `core/simulation.js` | Klimat, geometria, moduły i przebiegi |
| `map.js`, `roof-scene.js` | Leaflet i projekcja SVG |
| `core/storage.js`, `core/export.js` | Walidacja zapisanych porównań i CSV |
| `i18n*.js`, `number-guide.js` | Polski interfejs i wyjaśnienia liczb |

Przy przeliczeniu poprzedni wynik jest usuwany, eksport blokowany, a odpowiedzi starszych zadań Worker odrzucane. Niekompletne zapisane porównania są pomijane. Brak rejestru nie rozluźnia aktywnych filtrów. Błąd nowego szkicu zachowuje poprzedni; błędna zmiana symulacji wycofuje ustawienia.

## 5. Model i dobór

Oznaczenia: A — zaokrąglona powierzchnia użyteczna, c — udział pod moduły, η — sprawność, PR — współczynnik systemu, R — energia promieniowania ze źródła. Moc potencjalna P₀ = A × c × η przy promieniowaniu odniesienia 1 kW/m². Moc P jest ograniczona limitem użytkownika; s = P/P₀.

Energia elektryczna E = R × c × η × PR × s. Koszt K = P × koszt jednostkowy + koszt stały, zaokrąglony do groszy. W modelu zakłada się równomierne wykorzystanie promieniowania na powierzchni źródła. Domyślnie: c = 60%, η = 20%, PR = 0,8, 4 000 zł/kWp + 15 000 zł/obiekt i limit 150 kWp. Ceny są parametrami scenariusza, nie ofertą rynkową.

Dobór porównuje kolejność według energii, stosunku energii do kosztu oraz problem plecakowy 0/1. Koszty DP zaokrągla się w górę do co najwyżej 5 000 stanów budżetu; kontrola końcowa używa rzeczywistych kosztów. Zwracany jest najlepszy z trzech znalezionych zestawów. Nie gwarantujemy globalnego optimum. Ułamkowe rozluźnienie wyznacza górną granicę dla tych samych kandydatów; luka nie jest błędem prognozy energii.

Wrażliwość ponownie dobiera zestaw przy kosztach +20% lub energii −20%, z ponownym zastosowaniem progu uzysku. Krzywa pokazuje obliczenia dla kilku budżetów. Maksymalizowany jest wynik energetyczny; nie stosuje się profilu zużycia, taryf ani okresu zwrotu. Nakłady na jednostkę rocznej energii nie są LCOE.

## 6. Symulacja i ograniczenia fizyczne

W obrysie umieszcza się moduły 2 × 1 m z odstępami; uwzględniane są otwory i rozłączne części. Moc zależy od liczby mieszczących się modułów i sprawności. Wysokość 6 m, dach płaski i odstępy są założeniami szkicu. Kamera zmienia obraz, a kierunek i nachylenie modułów wpływają na obliczenia.

Energia opiera się na 8 760 godzinach TMY: promieniowaniu bezpośrednim, rozproszonym i globalnym, położeniu Słońca oraz izotropowym modelu płaszczyzny. Temperatura modułu używa uproszczenia Faimana, ogólnego współczynnika c-Si i wiatru ERA5. Straty bazowe wynoszą 14%. Nominalny limit mocy jest uproszczeniem; konkretnego falownika nie modeluje się. PR z Planu nie jest nakładany powtórnie.

Rok i miesiące sumują godziny źródłowe UTC. Widok doby używa czasu Europe/Warsaw i pełnych dni o 24 różnych godzinach. Profile pochmurny/środkowy/słoneczny odpowiadają rangom 10/50/90% w miesiącu TMY, nie prawdopodobieństwom produkcji. Wybór dnia nie zmienia sumy roku. Ręczna strata od cienia i śniegu dotyczy całego scenariusza. Nie ma modelu przeszkód, cieni między rzędami ani opadów śniegu.

Tabela kierunków porównuje stałą moc 1 kWp bez dodatkowego cienia i śniegu. Najlepsza komórka nie jest projektem optymalnym dla konkretnej połaci. Szkic nie potwierdza nośności, bezpieczeństwa pożarowego, praw, zgód konserwatorskich ani warunków OSD. Progi mocy w interfejsie służą orientacji; [wyjaśnienia GUNB](https://www.gov.pl/web/gunb/wyjasnienia-przepisow-ustawy---prawo-budowlane) nie zastępują oceny konkretnej inwestycji.

## 7. Eksport i prywatność

CSV planu zawiera wybrane obiekty, parametry, koszty, źródła i sygnały. JSON wersji 3 zapisuje wynik, metodykę, ślad wybranych dachów, metadane, SHA256 i warianty. JSON szkicu schematu 2 zawiera klimat, założenia, moduły w lokalnych metrach, rok i profil dnia. CSV szkicu zawiera profil godzinowy. Eksport CSV zabezpiecza pola tekstowe przed interpretacją jako formuły arkusza.

Osobny CSV weryfikacji obejmuje do 15 obiektów; przy większym planie nie jest jego pełnym wykazem. Pola ustaleń ręcznych pozostają puste. Edycja CSV nie zmienia statusów w aplikacji; import nie jest obsługiwany.

Nie ma własnego serwera przechowującego dane użytkowników. localStorage zależy od przeglądarki i adresu/portu; szkic wymaga eksportu przed zamknięciem strony. Stare zapisane ustawienie rosyjskiego języka nie przywraca usuniętej wersji interfejsu. Zewnętrzne zapytania podkładu docierają do OpenStreetMap, a otwierane linki do dostawców źródeł.

## 8. Weryfikacja i granice gotowości

Wersja 0.8.1 przeszła 52 testy automatyczne oraz po 60 scenariuszy przeglądarkowych z podkładem mapy i przy jego niedostępności. Testy obejmują budżet, porównanie z pełnym przeglądem małych problemów, górną granicę, źródłowe pola, geometrię z otworami, klimat i zachowanie interfejsu. Kontrole nie potwierdzają przydatności konstrukcji ani rzeczywistej produkcji PV.

Rozwiązanie przygotowano jako działający prototyp konkursowy. Dotychczasowy zakres obciążeń odpowiada 927 obiektom. Pełne pokrycie Krakowa wymaga osobnego testu pamięci i czasu: pamięć odtwarzania DP rośnie z liczbą kandydatów i stanów. Lokalna aplikacja nie zapewnia wspólnej edycji, uprawnień organizacyjnych ani serwerowego przechowywania planów.

## 9. Możliwości rozwoju i pilotaż

1. **Weryfikacja kilku obiektów:** współpraca z zarządcą, potwierdzenie adresu, właściciela i ograniczeń; następnie ocena techniczna. Mierniki: czas przygotowania listy i odsetek kandydatów potwierdzonych do dalszego etapu.
2. **Ekonomika:** profile zużycia, autokonsumpcja, ceny, koszty eksploatacji i scenariusze finansowania. Wyniki powinny wskazywać źródło i datę założeń.
3. **Dokładniejsza geometria:** połacie, przeszkody i cienie, dopiero po pozyskaniu odpowiednich danych. Wspólna metodyka dla planu i szkicu wymaga uzgodnienia modelu promieniowania.
4. **Większy zasięg i aktualizacja:** pozyskanie pełnego zbioru, test obciążeń, indeksowanie geometrii i harmonogram odświeżania; sprawdzanie, czy nowe dane zmieniają ranking.
5. **Proces organizacyjny:** import udokumentowanych wyników weryfikacji, ślad zmian i współpraca wielu użytkowników. Zaplecze serwerowe należy dodać dopiero po potwierdzeniu potrzeb.
6. **Monitoring istniejących instalacji PV na mapie:** powiązanie potwierdzonej instalacji z budynkiem i pobieranie pomiarów z falownika, licznika lub bramki telemetrycznej przez uzgodnione API. Karta obiektu mogłaby pokazywać bieżącą moc, energię dnia/miesiąca/roku, historię i czas ostatniego odczytu. Porównanie produkcji z modelem powinno uwzględniać dostępne dane o rzeczywistych warunkach pogodowych; samo TMY nie stanowi prognozy dla konkretnej doby. Powiadomienia wskazywałyby brak nowych danych, przerwy i nietypowe spadki produkcji. Pierwszy pilotaż obejmowałby jedną działającą instalację oraz sprawdzenie kompletności, jednostek i znaczników czasu pomiarów. Potrzebne są zgoda operatora, integracja źródła, serwer przyjmujący dane, baza szeregów czasowych i kontrola dostępu; dane dostępowe pozostawałyby po stronie serwera. Są to przyszłe elementy architektury. Telemetria pochodziłaby od operatorów instalacji i mogłaby być niepubliczna; jej warunki dostępu należy uzgodnić osobno.

Potencjalni odbiorcy to samorządy, jednostki zarządzające zasobem i wykonawcy analiz. Monitoring rozszerzałby zastosowanie na bieżący nadzór nad portfelem instalacji i obsługę eksploatacyjną. Model usługi oraz gotowość do zapłaty są hipotezami do sprawdzenia w pilotażu, a nie zawartymi umowami.
