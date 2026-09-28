package com.msme.seller.ui.bids

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.msme.seller.R
import com.msme.seller.core.bids.BidActions
import com.msme.seller.core.bids.BidMath
import com.msme.seller.core.format.Money
import com.msme.seller.core.listing.ListingDraftValidator
import com.msme.seller.core.model.Bid
import com.msme.seller.ui.components.Pill
import java.math.BigDecimal

@Composable
fun BidCard(
    bid: Bid,
    askingPrice: BigDecimal?,
    busy: Boolean,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onCounter: (BigDecimal, BigDecimal?, String) -> Unit,
    showCommodity: Boolean = false,
) {
    val actions = BidActions.forSeller(bid)
    var confirmAccept by remember { mutableStateOf(false) }
    var countering by remember { mutableStateOf(false) }
    val unit = bid.unit.orEmpty()

    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (showCommodity && bid.commodityName != null) {
                Text(bid.commodityName.orEmpty(), style = MaterialTheme.typography.titleMedium)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(bid.buyerName ?: stringResource(R.string.bid_buyer_fallback), style = MaterialTheme.typography.titleSmall)
                Pill(
                    stringResource(bidStatusLabel(bid)),
                    MaterialTheme.colorScheme.surfaceVariant,
                    MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                stringResource(
                    R.string.bid_offer_line,
                    Money.rupees(bid.offeredPrice),
                    unit,
                    Money.quantity(bid.offeredQuantity, unit),
                ),
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                stringResource(R.string.bid_total, Money.rupees(BidMath.total(bid))),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            BidMath.percentVsAsking(bid.offeredPrice, askingPrice)?.let { pct ->
                Text(
                    if (pct < 0) {
                        stringResource(R.string.bid_below_asking, "%.1f".format(-pct))
                    } else {
                        stringResource(R.string.bid_above_asking, "%.1f".format(pct))
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (pct < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
            bid.message?.takeIf { it.isNotBlank() }?.let {
                Text("“$it”", style = MaterialTheme.typography.bodyMedium)
            }
            if (actions.any) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                    Button(onClick = { confirmAccept = true }, enabled = !busy) { Text(stringResource(R.string.action_accept)) }
                    OutlinedButton(onClick = { countering = true }, enabled = !busy) { Text(stringResource(R.string.action_counter)) }
                    TextButton(onClick = onReject, enabled = !busy) { Text(stringResource(R.string.action_reject)) }
                }
            }
        }
    }

    if (confirmAccept) {
        AlertDialog(
            onDismissRequest = { confirmAccept = false },
            title = { Text(stringResource(R.string.bid_accept_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.bid_accept_body,
                        Money.quantity(bid.offeredQuantity, unit),
                        Money.rupees(BidMath.total(bid)),
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmAccept = false
                    onAccept()
                }) { Text(stringResource(R.string.action_accept)) }
            },
            dismissButton = { TextButton(onClick = { confirmAccept = false }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }

    if (countering) {
        CounterDialog(
            bid = bid,
            onDismiss = { countering = false },
            onSubmit = { price, qty, msg ->
                countering = false
                onCounter(price, qty, msg)
            },
        )
    }
}

private fun bidStatusLabel(bid: Bid) = when (bid.status) {
    "PENDING" -> if (bid.awaitingResponseFrom == "SELLER") R.string.bid_status_needs_you else R.string.bid_status_waiting_buyer
    "ACCEPTED" -> R.string.bid_status_accepted
    "REJECTED" -> R.string.bid_status_rejected
    "COUNTERED" -> R.string.bid_status_countered
    else -> R.string.bid_status_closed
}

@Composable
private fun CounterDialog(bid: Bid, onDismiss: () -> Unit, onSubmit: (BigDecimal, BigDecimal?, String) -> Unit) {
    var price by remember { mutableStateOf(bid.offeredPrice.stripTrailingZeros().toPlainString()) }
    var quantity by remember { mutableStateOf(bid.offeredQuantity.stripTrailingZeros().toPlainString()) }
    var message by remember { mutableStateOf("") }
    val parsedPrice = ListingDraftValidator.parseAmount(price)?.takeIf { it.signum() > 0 }
    val parsedQuantity = ListingDraftValidator.parseAmount(quantity)?.takeIf { it.signum() > 0 }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.counter_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = price,
                    onValueChange = { price = it },
                    label = { Text(stringResource(R.string.counter_price, bid.unit.orEmpty())) },
                    isError = parsedPrice == null,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    value = quantity,
                    onValueChange = { quantity = it },
                    label = { Text(stringResource(R.string.counter_quantity, bid.unit.orEmpty())) },
                    isError = parsedQuantity == null,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    value = message,
                    onValueChange = { message = it },
                    label = { Text(stringResource(R.string.counter_message)) },
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSubmit(parsedPrice!!, parsedQuantity, message.trim()) },
                enabled = parsedPrice != null && parsedQuantity != null,
            ) { Text(stringResource(R.string.action_send)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}
