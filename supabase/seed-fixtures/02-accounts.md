# Accounts — 50 retail boutiques under Elise Varga

All 50 accounts belong to the **Elise Varga** org (the brand). MBISR
reps (SH Showroom, Lauren Mackey) see them via federation — they do
not have their own accounts.

## Insert order & timestamps

List order below = **display order on `/accounts`** (newest-first sort).
Row 1 is the most-recently-created account.

Timestamp rule:

```
created_at = now() - ((row_number - 1) * interval '11 hours')
```

So row 1 stamps at ~now, row 50 stamps ~22 days ago. This keeps demo
data feeling current regardless of when you reseed, and preserves the
same on-screen order for screenshots.

## Derived field generation

For each row, fill derived fields deterministically from the business
name and contact first name:

| Field           | Rule                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `contact_email` | `lower(replace(first,' ','')) \|\| '@' \|\| lower(regexp_replace(business_name, '[^a-zA-Z0-9]', '', 'g')) \|\| '.com'` |
| `phone`         | `'(' \|\| lpad((200+row_num)::text,3,'0') \|\| ') 555-' \|\| lpad(((row_num*17)%10000)::text,4,'0')`                   |
| `zip`           | `lpad(((abs(hashtext(business_name))%90000)+10000)::text, 5, '0')`                                                     |
| `website`       | `'https://' \|\| lower(regexp_replace(business_name,'[^a-zA-Z0-9]','','g')) \|\| '.com'`                               |
| `country`       | `'US'` (literal)                                                                                                       |
| `is_active`     | `true`                                                                                                                 |
| `archived_at`   | `null`                                                                                                                 |

## The 50 accounts

| #   | Business name          | Contact             | City           | State |
| --- | ---------------------- | ------------------- | -------------- | ----- |
| 1   | Tidepool 42            | Katie Donovan       | Beaufort       | SC    |
| 2   | Fernwick Dry Goods     | Ashley Pierce       | Burlington     | VT    |
| 3   | Quillwren              | Samantha Ruiz       | Madison        | WI    |
| 4   | The Fog Index          | Priya Sharma        | Portland       | ME    |
| 5   | Ninebark Mercantile    | Megan Caldwell      | Asheville      | NC    |
| 6   | Maison Lumen           | Ava Whitcomb        | Brooklyn       | NY    |
| 7   | Ember & Oak Boutique   | Priya Khatri        | Austin         | TX    |
| 8   | Marigold Threadworks   | Juno Bellamy        | Portland       | OR    |
| 9   | Fjord Atelier          | Soren Nilsson       | Minneapolis    | MN    |
| 10  | Quill & Vine           | Hazel Odesanya      | Charleston     | SC    |
| 11  | Saltwind Supply Co     | Milo Franchetti     | Santa Cruz     | CA    |
| 12  | North Harbor Dry Goods | Imani Rooks         | Portsmouth     | NH    |
| 13  | Velour Common          | Elena Castellanos   | Miami          | FL    |
| 14  | Dovetail Mercantile    | Theo Marchetti      | Savannah       | GA    |
| 15  | The Linen Room         | Nora Ingleby        | Nashville      | TN    |
| 16  | Halcyon House          | Cyrus Okafor        | Providence     | RI    |
| 17  | Sable & Stone          | Cleo Vandermeer     | Boulder        | CO    |
| 18  | Aurelia Studios        | Mira Solano         | Los Angeles    | CA    |
| 19  | Birch Row              | Jude Ashbury        | Burlington     | VT    |
| 20  | The Tailoring Co.      | Otis Kleinman       | Chicago        | IL    |
| 21  | Runway West            | Sana Al-Mahdi       | Scottsdale     | AZ    |
| 22  | Atelier Rive           | Camille Boucher     | New Orleans    | LA    |
| 23  | Briar & Bloom          | Poppy Hollingshead  | Asheville      | NC    |
| 24  | Indigo Lane            | Rhea Chatterjee     | Brooklyn       | NY    |
| 25  | Wildrose Boutique      | Greta Lindvall      | Madison        | WI    |
| 26  | Kestrel & Co           | Felix Moreau        | Bozeman        | MT    |
| 27  | Linea Forma            | Dario Pellegrino    | Houston        | TX    |
| 28  | Moss & Marrow          | Wren Oakleigh       | Bend           | OR    |
| 29  | Petal Press            | Lior Ben-Hur        | Berkeley       | CA    |
| 30  | The Ivory Collective   | Sasha Petrovsky     | Denver         | CO    |
| 31  | Driftwood Outfitters   | Ansel Rourke        | Rockport       | ME    |
| 32  | Plumeria Shop          | Kalea Mahoe         | Honolulu       | HI    |
| 33  | Rue & Rose             | Marguerite Beaumont | Charleston     | SC    |
| 34  | Modern Mercantile      | Dex Yamamoto        | Seattle        | WA    |
| 35  | Laurel Park            | Simone Okonkwo      | Atlanta        | GA    |
| 36  | Pivot Showroom         | Reid Ferencz        | Brooklyn       | NY    |
| 37  | Crescent Textiles      | Noor Haddad         | Detroit        | MI    |
| 38  | Harvester Lane         | Cal Donohue         | Lexington      | KY    |
| 39  | The Drift Shop         | Beatrix Thornhill   | Ojai           | CA    |
| 40  | Polaris Boutique       | Magnus Eklund       | Anchorage      | AK    |
| 41  | Glasshouse Studio      | Irie Makanaka       | Oakland        | CA    |
| 42  | Clover & Cane          | Edith Pruitt        | Knoxville      | TN    |
| 43  | Thistle Shop           | Fiona MacAllister   | Portland       | ME    |
| 44  | Terra Cotta Goods      | Yara Benavides      | Santa Fe       | NM    |
| 45  | The Cedar Closet       | Bram Vollmer        | Grand Rapids   | MI    |
| 46  | Moxie & Main           | Vera Tsoukalas      | Tampa          | FL    |
| 47  | Sunday Supply          | Tadhg Connolly      | Boston         | MA    |
| 48  | Wayfarer Dry Goods     | Aris Papadakis      | Salt Lake City | UT    |
| 49  | Gildhouse              | Octavia Radcliffe   | Philadelphia   | PA    |
| 50  | Little Oak Studio      | Rosalind Kinsella   | Richmond       | VA    |

## Insertion SQL pattern

Claude runs a single INSERT ... SELECT using a VALUES list of the 50
rows above, joined to the Elise Varga org id, with the derived fields
computed per the rules above:

```sql
INSERT INTO public.accounts (
  organization_id, business_name, contact_first_name, contact_last_name,
  contact_email, phone, city, state, zip, country, website,
  is_active, created_at
)
SELECT
  (SELECT id FROM public.organizations WHERE name = 'Elise Varga'),
  biz, fname, lname,
  lower(replace(fname,' ','')) || '@' || lower(regexp_replace(biz, '[^a-zA-Z0-9]', '', 'g')) || '.com',
  '(' || lpad((200 + row_num)::text,3,'0') || ') 555-' || lpad(((row_num*17)%10000)::text,4,'0'),
  city, st,
  lpad(((abs(hashtext(biz))%90000) + 10000)::text, 5, '0'),
  'US',
  'https://' || lower(regexp_replace(biz, '[^a-zA-Z0-9]', '', 'g')) || '.com',
  true,
  now() - ((row_num - 1) * interval '11 hours')
FROM (
  VALUES
    (1,  'Tidepool 42',            'Katie',     'Donovan',       'Beaufort',       'SC'),
    (2,  'Fernwick Dry Goods',     'Ashley',    'Pierce',        'Burlington',     'VT'),
    -- ...all 50 rows in the table above, same order...
    (50, 'Little Oak Studio',      'Rosalind',  'Kinsella',      'Richmond',       'VA')
) AS t(row_num, biz, fname, lname, city, st);
```
