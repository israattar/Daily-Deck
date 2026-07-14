//+------------------------------------------------------------------+
//| DailyDeckReporter.mq4                                            |
//| Sends this account's daily P/L to the Daily Deck dashboard.      |
//| Read-only: never places, modifies or closes trades.              |
//|                                                                  |
//| Setup:                                                           |
//|  1. Copy this file to MT4: File > Open Data Folder >             |
//|     MQL4 > Experts, then restart MT4 (it compiles itself).       |
//|  2. Account History tab > right-click > "All History".           |
//|  3. Optional (for instant updates): Tools > Options >            |
//|     Expert Advisors > "Allow WebRequest for listed URL" and      |
//|     add  http://127.0.0.1:5599                                   |
//|  4. Drag DailyDeckReporter from the Navigator onto any chart.    |
//| Without step 3 it still works — Daily Deck reads the fallback    |
//| file this EA writes, within about a minute.                      |
//+------------------------------------------------------------------+
#property strict

input string DeckUrl     = "http://127.0.0.1:5599/trading"; // Daily Deck listener
input int    SyncMinutes = 5;                               // how often to sync

bool firstRun = true;

int OnInit()
{
   EventSetTimer(5); // first sync shortly after attach, then every SyncMinutes
   Print("DailyDeckReporter started — syncing every ", SyncMinutes, " minutes");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   if(firstRun)
   {
      firstRun = false;
      EventKillTimer();
      EventSetTimer(SyncMinutes * 60);
   }
   SendHistory();
}

//+------------------------------------------------------------------+
//| Sum every closed trade (profit+commission+swap) per close-day    |
//| and deliver the result to Daily Deck.                            |
//+------------------------------------------------------------------+
void SendHistory()
{
   // Per-day aggregates: net P/L, trade count, wins/losses, hold time in
   // seconds (total / wins / losses), plus every individual trade so the
   // dashboard can show a per-day breakdown.
   string days[];
   double totals[];
   int    trades[], wins[], losses[];
   double holdAll[], holdWin[], holdLoss[];
   string tradeJson[];
   int    count = 0;

   // Broker times → UTC, so the dashboard can render them in UK time.
   int gmtOffset = ServerGmtOffset();

   for(int i = 0; i < OrdersHistoryTotal(); i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL) continue; // skip balance ops & pendings
      if(OrderCloseTime() == 0) continue;

      string stamp = TimeToString(OrderCloseTime(), TIME_DATE); // yyyy.mm.dd
      string day   = StringSubstr(stamp, 0, 4) + "-" + StringSubstr(stamp, 5, 2) + "-" + StringSubstr(stamp, 8, 2);
      double net   = OrderProfit() + OrderCommission() + OrderSwap();
      double held  = (double)(OrderCloseTime() - OrderOpenTime()); // seconds

      int idx = -1;
      for(int j = 0; j < count; j++)
         if(days[j] == day) { idx = j; break; }
      if(idx < 0)
      {
         ArrayResize(days, count + 1);
         ArrayResize(totals, count + 1);
         ArrayResize(trades, count + 1);
         ArrayResize(wins, count + 1);
         ArrayResize(losses, count + 1);
         ArrayResize(holdAll, count + 1);
         ArrayResize(holdWin, count + 1);
         ArrayResize(holdLoss, count + 1);
         ArrayResize(tradeJson, count + 1);
         days[count]   = day;
         totals[count] = 0;
         trades[count] = 0;
         wins[count]   = 0;
         losses[count] = 0;
         holdAll[count]  = 0;
         holdWin[count]  = 0;
         holdLoss[count] = 0;
         tradeJson[count] = "";
         idx = count;
         count++;
      }
      totals[idx]  += net;
      trades[idx]  += 1;
      holdAll[idx] += held;
      if(net > 0) { wins[idx] += 1;   holdWin[idx]  += held; }
      if(net < 0) { losses[idx] += 1; holdLoss[idx] += held; }

      // One entry per trade: symbol, side, lots, open/close (UTC epoch), net.
      if(StringLen(tradeJson[idx]) > 0) tradeJson[idx] += ",";
      tradeJson[idx] += "{\"s\":\"" + OrderSymbol() + "\""
                      + ",\"t\":\"" + (OrderType() == OP_BUY ? "buy" : "sell") + "\""
                      + ",\"l\":" + DoubleToString(OrderLots(), 2)
                      + ",\"o\":" + IntegerToString((int)OrderOpenTime() - gmtOffset)
                      + ",\"c\":" + IntegerToString((int)OrderCloseTime() - gmtOffset)
                      + ",\"p\":" + DoubleToString(net, 2)
                      + "}";
   }

   if(count == 0)
   {
      Print("DailyDeckReporter: no closed trades found (Account History set to All History?)");
      return;
   }

   string json = "{\"account\":\"" + IntegerToString(AccountNumber()) + "\",\"days\":{";
   for(int j = 0; j < count; j++)
   {
      if(j > 0) json += ",";
      json += "\"" + days[j] + "\":" + DoubleToString(totals[j], 2);
   }
   json += "},\"stats\":{";
   for(int k = 0; k < count; k++)
   {
      if(k > 0) json += ",";
      json += "\"" + days[k] + "\":{"
            + "\"n\":"   + IntegerToString(trades[k])
            + ",\"w\":"  + IntegerToString(wins[k])
            + ",\"l\":"  + IntegerToString(losses[k])
            + ",\"hs\":" + DoubleToString(holdAll[k], 0)
            + ",\"hws\":" + DoubleToString(holdWin[k], 0)
            + ",\"hls\":" + DoubleToString(holdLoss[k], 0)
            + "}";
   }
   json += "},\"trades\":{";
   for(int t = 0; t < count; t++)
   {
      if(t > 0) json += ",";
      json += "\"" + days[t] + "\":[" + tradeJson[t] + "]";
   }
   json += "}}";

   WriteFallbackFile(json);

   char   post[];
   char   result[];
   string resultHeaders;
   StringToCharArray(json, post, 0, StringLen(json));
   int status = WebRequest("POST", DeckUrl, "Content-Type: application/json\r\n", 5000, post, result, resultHeaders);

   if(status == 200)
      Print("DailyDeckReporter: sent ", count, " days to Daily Deck");
   else if(status == -1)
      Print("DailyDeckReporter: direct push blocked (add ", DeckUrl, " under Tools>Options>Expert Advisors). Fallback file written instead.");
   else
      Print("DailyDeckReporter: Daily Deck responded ", status, " — fallback file written");
}

// The broker server's offset from GMT right now, snapped to 30 minutes.
// Subtracting it converts order times to UTC for correct UK-time display.
int ServerGmtOffset()
{
   int off = (int)(TimeCurrent() - TimeGMT());
   return (int)(MathRound(off / 1800.0) * 1800);
}

// Daily Deck watches this file, so syncing works even without WebRequest.
void WriteFallbackFile(string json)
{
   FolderCreate("DailyDeck");
   int handle = FileOpen("DailyDeck\\pnl.json", FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle != INVALID_HANDLE)
   {
      FileWriteString(handle, json);
      FileClose(handle);
   }
}
