"""Die Verteilung von Betraegen darf unter keinen Umstaenden Rappen verlieren."""

import itertools

import pytest

from app.services.money import allocate, format_amount, parse_amount


@pytest.mark.parametrize(
    ("total", "weights", "expected"),
    [
        (1000, [1, 1, 1], [334, 333, 333]),
        (1000, [1, 1], [500, 500]),
        (10_000, [60, 40], [6000, 4000]),
        (100, [1, 1, 1, 1, 1, 1], [17, 17, 17, 17, 16, 16]),
        (1, [1, 1, 1], [1, 0, 0]),
        (-1000, [1, 1, 1], [-334, -333, -333]),
        (0, [1, 1], [0, 0]),
        (999, [1], [999]),
        (1000, [3, 1], [750, 250]),
    ],
)
def test_allocate_known_cases(total, weights, expected):
    assert allocate(total, weights) == expected


def test_allocate_never_loses_money():
    for total in range(-250, 250):
        for count in range(1, 7):
            for weights in itertools.islice(
                itertools.product([1, 2, 3, 5], repeat=count), 40
            ):
                parts = allocate(total, list(weights))
                assert sum(parts) == total, (total, weights, parts)
                assert len(parts) == count


def test_allocate_remainder_goes_to_first_person_when_equal():
    # Spezifikation: bei gleichmaessiger Verteilung traegt die erste Person den Rest.
    assert allocate(10, [1, 1, 1, 1, 1, 1])[0] == 2
    assert allocate(10, [1, 1, 1, 1, 1, 1])[1:] == [2, 2, 2, 1, 1]


def test_allocate_rejects_empty_or_zero_weights():
    with pytest.raises(ValueError):
        allocate(100, [])
    with pytest.raises(ValueError):
        allocate(100, [0, 0])
    with pytest.raises(ValueError):
        allocate(100, [1, -1])


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("12.50", 1250),
        ("1'234.50", 123_450),
        ("1 234,50", 123_450),
        ("1.234,50", 123_450),
        ("1,234.50", 123_450),
        ("-12.-", -1200),
        ("0.005", 1),
        ("CHF 42", 4200),
        (42, 4200),
    ],
)
def test_parse_amount(text, expected):
    assert parse_amount(text) == expected


def test_parse_amount_rejects_garbage():
    with pytest.raises(ValueError):
        parse_amount("zwoelf")
    with pytest.raises(ValueError):
        parse_amount("")


def test_format_amount_round_trips():
    for value in (-123_456, -1, 0, 1, 99, 100, 123_456):
        assert parse_amount(format_amount(value)) == value
