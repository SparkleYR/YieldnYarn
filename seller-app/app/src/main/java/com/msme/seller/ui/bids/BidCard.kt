package com.msme.seller.ui.bids

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import com.msme.seller.ui.components.AppCard
import com.msme.seller.ui.components.LabeledValue
import com.msme.seller.ui.components.Pill
import com.msme.seller.ui.components.PrimaryButton
import com.msme.seller.ui.components.SecondaryButton
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

    val scheme = MaterialTheme.colorScheme
    val (pillBg, pillFg) = when {
        bid.status == "PENDING" && bid.awaitingResponseFrom == "SELLER" -> scheme.secondaryContainer to scheme.onSecondaryContainer
        bid.status == "ACCEPTED" -> scheme.primaryContainer to scheme.onPrimaryContainer
        bid.status == "REJECTED" -> scheme.errorContainer to scheme.onErrorContainer
        bid.status == "COUNTERED" -> scheme.tertiaryContainer to scheme.onTertiaryContainer
        else -> scheme.surfaceVariant to scheme.onSurfaceVariant
    }

    AppCard(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                if (showCommodity && bid.commodityName != null) {
                    Text(bid.commodityName.orEmpty(), style = MaterialTheme.typography.titleMedium)
                }
                Text(
                    bid.buyerName ?: stringResource(R.string.bid_buyer_fallback),
                    style = if (showCommodity) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.titleSmall,
                    color = if (showCommodity) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                )
            }
            Pill(stringResource(bidStatusLabel(bid)), pillBg, pillFg, Modifier.padding(start = 8.dp))
        }
        Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                LabeledValue(stringResource(R.string.bid_price_label), stringResource(R.string.price_per_unit, Money.rupees(bid.offeredPrice), unit))
                LabeledValue(stringResource(R.string.field_quantity), Money.quantity(bid.offeredQuantity, unit))
                LabeledValue(stringResource(R.string.bid_total_label), Money.rupees(BidMath.total(bid)))
            }
        }
        BidMath.percentVsAsking(bid.offeredPrice, askingPrice)?.let { pct ->
            Text(
                if (pct < 0) {
                    stringResource(R.string.bid_below_asking, "%.1f".format(-pct))
                } else {
                    stringResource(R.string.bid_above_asking, "%.1f".format(pct))
                },
                style = MaterialTheme.typography.bodyMedium,
                color = if (pct < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            )
        }
        bid.message?.takeIf { it.isNotBlank() }?.let {
            Text("“$it”", style = MaterialTheme.typography.bodyLarge)
        }
        if (actions.any) {
            PrimaryButton(stringResource(R.string.action_accept), onClick = { confirmAccept = true }, enabled = !busy, modifier = Modifier.padding(top = 4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SecondaryButton(stringResource(R.string.action_counter), onClick = { countering = true }, enabled = !busy, modifier = Modifier.weight(1f))
                SecondaryButton(stringResource(R.string.action_reject), onClick = onReject, enabled = !busy, modifier = Modifier.weight(1f))
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
