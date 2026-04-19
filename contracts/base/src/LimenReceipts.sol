// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title LimenReceipts
 * @notice Optional on-chain receipts + escrow for Limen.
 * @dev Limen itself verifies USDC settlement off-chain; this contract is
 *      only required for operators who want:
 *        1. A canonical on-chain receipt per request (for downstream proofs).
 *        2. An escrow pattern where refunds are automatic on `UPSTREAM_FAILED`.
 *
 *      Security notes:
 *      - Only the `operator` multisig can mark receipts as refunded.
 *      - Receipts are **immutable once written**; refund state is a separate mapping.
 *      - Reentrancy guard is intentional even though transfers are pull-based.
 *      - Uses `SafeERC20` to handle USDC's non-standard return behaviour.
 */

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

contract LimenReceipts is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------
    // Roles
    // ------------------------------------------------------------------
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    /// @notice USDC (or any ERC-20) the operator accepts.
    IERC20 public immutable token;

    /// @notice Receiver wallet (operator-controlled).
    address public immutable receiver;

    struct Receipt {
        address payer;
        uint96  amount;        // packed to save a storage slot with payer
        uint48  observedAt;    // seconds since epoch
        bool    refunded;
    }

    /// @dev `nonce => receipt`.  Nonces are server-issued (see docs/payment-flow.md).
    mapping(bytes32 nonce => Receipt) public receipts;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    event ReceiptCommitted(
        bytes32 indexed nonce,
        address indexed payer,
        uint256 amount,
        uint256 observedAt,
        string  endpoint
    );
    event ReceiptRefunded(
        bytes32 indexed nonce,
        address indexed payer,
        uint256 amount,
        string  reason
    );

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------
    error ReceiptAlreadyCommitted(bytes32 nonce);
    error ReceiptMissing(bytes32 nonce);
    error ReceiptAlreadyRefunded(bytes32 nonce);
    error AmountMustBeNonZero();
    error AmountOverflow();

    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------
    constructor(IERC20 _token, address _receiver, address admin) {
        require(address(_token) != address(0), "token=0");
        require(_receiver != address(0), "receiver=0");
        require(admin != address(0), "admin=0");
        token = _token;
        receiver = _receiver;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ------------------------------------------------------------------
    // Operator actions
    // ------------------------------------------------------------------

    /// @notice Commit a receipt for a verified payment.  Must be called AFTER
    ///         off-chain verification (see Invariants I1-I9 in docs/security.md).
    ///         `payer` has already sent `amount` of `token` to `receiver`.
    function commitReceipt(
        bytes32 nonce,
        address payer,
        uint256 amount,
        string calldata endpoint
    )
        external
        whenNotPaused
        nonReentrant
        onlyRole(OPERATOR_ROLE)
    {
        if (amount == 0) revert AmountMustBeNonZero();
        if (amount > type(uint96).max) revert AmountOverflow();
        if (receipts[nonce].payer != address(0)) revert ReceiptAlreadyCommitted(nonce);

        receipts[nonce] = Receipt({
            payer:      payer,
            amount:     uint96(amount),
            observedAt: uint48(block.timestamp),
            refunded:   false
        });

        emit ReceiptCommitted(nonce, payer, amount, block.timestamp, endpoint);
    }

    /// @notice Refund a receipt.  Transfers `amount` USDC from *this contract's*
    ///         escrow balance back to the payer.  Requires the operator
    ///         pre-fund the contract so refunds do not depend on the receiver
    ///         wallet being online.
    function refundReceipt(bytes32 nonce, string calldata reason)
        external
        nonReentrant
        onlyRole(OPERATOR_ROLE)
    {
        Receipt storage r = receipts[nonce];
        if (r.payer == address(0))  revert ReceiptMissing(nonce);
        if (r.refunded)              revert ReceiptAlreadyRefunded(nonce);

        r.refunded = true;
        token.safeTransfer(r.payer, r.amount);
        emit ReceiptRefunded(nonce, r.payer, r.amount, reason);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------
    function pause()   external onlyRole(PAUSER_ROLE) { _pause();   }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    /// @notice Rescue any tokens *other than* the paywall token — we never
    ///         want to let an admin drain payer refund escrow by accident.
    function rescueForeignToken(IERC20 foreign, address to, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(address(foreign) != address(token), "cannot rescue paywall token");
        foreign.safeTransfer(to, amount);
    }
}
