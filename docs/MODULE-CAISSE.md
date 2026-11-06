# Module Caisse — transfert depuis PREMIDIS

Source : dépôt `PROJET-MARKETING` (PREMIDIS Gestion commerciale), fichiers `backend/routes/cash_routes.py`,
`backend/models_erp.py` (CashSession, CashOperation, DenominationCount), `frontend/src/pages/CashPage.jsx`,
lien vente → caisse dans `backend/routes/orders_routes.py`, rapport `/reports/cash` (`reports_routes.py`).

## Correspondance des fonctionnalités

| PREMIDIS | CMD Pro |
|---|---|
| `GET /cash/sessions/current` : session ouverte, entrées, sorties, solde théorique | `cash.currentSession` — en-tête de la page Caisse |
| `POST /cash/sessions/open` (fond de caisse, une seule session ouverte) | `cash.openSession` — bouton « Ouvrir » ; **une session par devise** (USD, CDF), garantie par un index SQL |
| `POST /cash/sessions/close` (billetage 100/50/20/10/5/1, compté, écart, notification « direction ») | `cash.closeSession` — fenêtre « Billetage & Clôture », écart calculé en direct ; coupures CDF ajoutées ; notification aux personnes qui valident la Finance |
| `GET /cash/sessions` (historique) | Onglet « Historique des sessions » (avec le détail du billetage) |
| `POST /cash/operations` (entrée / sortie, catégorie, méthode espèces / virement / mobile money, description) + écritures comptables | `cash.createOperation` — boutons « Entrée » et « Sortie » ; écriture au journal financier (`LedgerEntry`, source `CASH_OPERATION`) |
| `GET /cash/operations` | Onglet « Opérations » de la session |
| Validation de vente → opération de caisse « sale » | Chaque encaissement de facture (consultation, pharmacie, hospitalisation…) est inscrit dans la session ouverte : catégorie « Encaissement de facture », ou « Remboursement de dette » pour une facture passée en crédit |
| `POST /credits/payments` → opération « credit_payment » | Remboursement d'une dette patient = paiement de sa facture → opération « Remboursement de dette » |
| (aucun équivalent) | Extourne d'un encaissement → opération de sortie « Extourne d'encaissement » |
| `GET /reports/cash` (entrées, sorties, net, par catégorie) | Onglet « Rapport » (aujourd'hui, 7 jours, 30 jours ; par devise) |
| Droits `cash.read`, `cash.create`, `cash.close` | Droits CMD Pro `cash.view` (consulter) et `cash.create` (ouvrir, opérer, clôturer) ; la Finance consulte |
| Journal d'audit | `audit` : OPEN, CLOSE, CASH_IN, CASH_OUT |

Conservé de CMD Pro (onglet « Factures ») : prestations à facturer, factures, paiements partiels, reçus PDF, remises,
demandes de crédit au Directeur général, extournes, totaux du jour.

## Garanties
- Les opérations de caisse ne peuvent être ni modifiées ni supprimées (trigger SQL), montant toujours positif.
- Pas de double écriture au journal : les encaissements de factures restent comptabilisés par la facturation.
- Sans session ouverte, un encaissement reste possible (comme dans PREMIDIS) ; il n'est alors rattaché à aucune session.
- Migration `20261106000700_caisse_premidis` : ajouts uniquement (annulation : `down.sql`).

## Prochaines adaptations hospitalières (à décider)
Catégories propres à l'hôpital, sessions par caissier ou par guichet, sorties liées aux dépenses validées (module Finance),
moyens de paiement réels (mobile money, virement) pour les factures, rapport par service.
