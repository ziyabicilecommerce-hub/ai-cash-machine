/**
 * WZIYA SPORT - Theme JavaScript
 * Modern Sports Store Theme
 */

(function () {
  'use strict';

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(function () {
      toast.classList.remove('show');
    }, duration);
  }

  function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('active');
  }

  function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  function formatMoney(cents) {
    const euros = (cents / 100).toFixed(2).replace('.', ',');
    return euros + ' €';
  }

  // ==========================================
  // STICKY HEADER ON SCROLL
  // ==========================================

  function initStickyHeader() {
    const header = document.getElementById('site-header');
    if (!header) return;

    let lastScrollY = 0;
    let ticking = false;

    function updateHeader() {
      const scrollY = window.scrollY || window.pageYOffset;
      if (scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
      lastScrollY = scrollY;
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(updateHeader);
        ticking = true;
      }
    }, { passive: true });

    updateHeader();
  }

  // ==========================================
  // MOBILE MENU TOGGLE
  // ==========================================

  function initMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const mobileNav = document.getElementById('mobile-nav');
    const mobileNavLinks = mobileNav ? mobileNav.querySelectorAll('a') : [];

    if (!hamburger || !mobileNav) return;

    function openMenu() {
      hamburger.classList.add('active');
      mobileNav.classList.add('active');
      document.body.style.overflow = 'hidden';
      hamburger.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
      hamburger.classList.remove('active');
      mobileNav.classList.remove('active');
      document.body.style.overflow = '';
      hamburger.setAttribute('aria-expanded', 'false');
    }

    hamburger.addEventListener('click', function () {
      if (mobileNav.classList.contains('active')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    mobileNavLinks.forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileNav.classList.contains('active')) {
        closeMenu();
      }
    });

    // Close on outside click
    mobileNav.addEventListener('click', function (e) {
      if (e.target === mobileNav) {
        closeMenu();
      }
    });
  }

  // ==========================================
  // CART COUNT UPDATE
  // ==========================================

  function updateCartCount() {
    const cartCountEl = document.querySelector('.cart-count');
    if (!cartCountEl) return;

    fetch('/cart.js', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    .then(function (res) { return res.json(); })
    .then(function (cart) {
      cartCountEl.textContent = cart.item_count;
      if (cart.item_count > 0) {
        cartCountEl.style.display = 'flex';
      } else {
        cartCountEl.style.display = 'none';
      }
    })
    .catch(function (err) {
      console.warn('Cart count update failed:', err);
    });
  }

  // ==========================================
  // ADD TO CART AJAX
  // ==========================================

  function addToCart(variantId, quantity, buttonEl) {
    if (!variantId) {
      showToast('Bitte eine Variante auswählen.');
      return;
    }

    quantity = quantity || 1;

    if (buttonEl) {
      buttonEl.classList.add('loading');
      buttonEl.textContent = 'Wird hinzugefügt...';
      buttonEl.disabled = true;
    }

    showLoading();

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: variantId,
        quantity: parseInt(quantity, 10)
      })
    })
    .then(function (res) {
      if (!res.ok) return res.json().then(function (d) { throw new Error(d.description || 'Fehler'); });
      return res.json();
    })
    .then(function (item) {
      updateCartCount();
      showToast(item.title + ' wurde zum Warenkorb hinzugefügt!');
      openCartDrawer();
    })
    .catch(function (err) {
      showToast('Fehler: ' + err.message);
    })
    .finally(function () {
      hideLoading();
      if (buttonEl) {
        buttonEl.classList.remove('loading');
        buttonEl.textContent = 'IN DEN WARENKORB';
        buttonEl.disabled = false;
      }
    });
  }

  // ==========================================
  // PRODUCT CARD ADD TO CART
  // ==========================================

  function initProductCardButtons() {
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-add-to-cart]');
      if (!btn) return;

      const variantId = btn.dataset.variantId || btn.dataset.productId;
      const quantity = 1;

      addToCart(variantId, quantity, btn);
    });
  }

  // ==========================================
  // PRODUCT PAGE
  // ==========================================

  function initProductPage() {
    const addToCartForm = document.getElementById('add-to-cart-form');
    if (!addToCartForm) return;

    const addToCartBtn = document.getElementById('add-to-cart-btn');
    const variantSelect = document.getElementById('variant-select');
    const quantityInput = document.getElementById('quantity-input');

    // Quantity buttons
    const qtyMinus = document.getElementById('qty-minus');
    const qtyPlus = document.getElementById('qty-plus');

    if (qtyMinus && qtyPlus && quantityInput) {
      qtyMinus.addEventListener('click', function () {
        const val = parseInt(quantityInput.value, 10);
        if (val > 1) quantityInput.value = val - 1;
      });

      qtyPlus.addEventListener('click', function () {
        const val = parseInt(quantityInput.value, 10);
        quantityInput.value = val + 1;
      });
    }

    // Variant radio buttons
    const variantRadios = document.querySelectorAll('.variant-radio');
    variantRadios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        updateProductVariant();
      });
    });

    // Form submit
    addToCartForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const variantId = getSelectedVariant();
      const quantity = quantityInput ? parseInt(quantityInput.value, 10) : 1;
      addToCart(variantId, quantity, addToCartBtn);
    });

    function getSelectedVariant() {
      // Try variant select dropdown first
      if (variantSelect && variantSelect.value) {
        return variantSelect.value;
      }
      // Try radio buttons
      const checkedRadio = document.querySelector('.variant-radio:checked');
      if (checkedRadio) return checkedRadio.value;
      // Try data attribute on button
      if (addToCartBtn && addToCartBtn.dataset.variantId) {
        return addToCartBtn.dataset.variantId;
      }
      return null;
    }

    function updateProductVariant() {
      // Update price display if variant data available
      const selectedVariantId = getSelectedVariant();
      if (window.productVariants && selectedVariantId) {
        const variant = window.productVariants.find(function (v) {
          return v.id.toString() === selectedVariantId.toString();
        });
        if (variant) {
          const priceEl = document.getElementById('product-price');
          if (priceEl) priceEl.textContent = formatMoney(variant.price);
          if (addToCartBtn) {
            addToCartBtn.dataset.variantId = variant.id;
            if (!variant.available) {
              addToCartBtn.textContent = 'NICHT VERFÜGBAR';
              addToCartBtn.disabled = true;
            } else {
              addToCartBtn.textContent = 'IN DEN WARENKORB';
              addToCartBtn.disabled = false;
            }
          }
        }
      }
    }
  }

  // ==========================================
  // PRODUCT IMAGE THUMBNAILS
  // ==========================================

  function initProductGallery() {
    const thumbs = document.querySelectorAll('.product-thumb');
    const mainImage = document.getElementById('product-main-img');

    if (!thumbs.length || !mainImage) return;

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        thumbs.forEach(function (t) { t.classList.remove('active'); });
        thumb.classList.add('active');
        const src = thumb.dataset.src;
        if (src) {
          mainImage.src = src;
        }
      });
    });
  }

  // ==========================================
  // PRODUCT TABS
  // ==========================================

  function initProductTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    if (!tabBtns.length) return;

    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const target = btn.dataset.tab;

        tabBtns.forEach(function (b) { b.classList.remove('active'); });
        tabContents.forEach(function (c) { c.classList.remove('active'); });

        btn.classList.add('active');
        const content = document.getElementById('tab-' + target);
        if (content) content.classList.add('active');
      });
    });
  }

  // ==========================================
  // CART DRAWER
  // ==========================================

  function openCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) {
      drawer.classList.add('open');
      document.body.style.overflow = 'hidden';
      loadCartDrawerContent();
    } else {
      // No drawer, navigate to cart page
      // Optionally could redirect: window.location.href = '/cart';
    }
  }

  function closeCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) {
      drawer.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  function loadCartDrawerContent() {
    const drawerContent = document.getElementById('cart-drawer-content');
    if (!drawerContent) return;

    fetch('/cart.js', {
      headers: { 'Content-Type': 'application/json' }
    })
    .then(function (res) { return res.json(); })
    .then(function (cart) {
      if (cart.items.length === 0) {
        drawerContent.innerHTML = '<p class="cart-empty-msg">Dein Warenkorb ist leer.</p>';
        return;
      }
      let html = '<ul class="drawer-items">';
      cart.items.forEach(function (item) {
        html += '<li class="drawer-item">';
        if (item.image) {
          html += '<img src="' + item.image + '" alt="' + item.title + '" width="64" height="64">';
        }
        html += '<div><span class="drawer-item-title">' + item.title + '</span>';
        html += '<span class="drawer-item-price">' + formatMoney(item.price) + '</span></div>';
        html += '</li>';
      });
      html += '</ul>';
      html += '<div class="drawer-total">Gesamt: ' + formatMoney(cart.total_price) + '</div>';
      html += '<a href="/cart" class="btn btn-primary" style="width:100%;text-align:center;">ZUM WARENKORB</a>';
      html += '<a href="/checkout" class="btn btn-outline" style="width:100%;text-align:center;margin-top:8px;">KASSE</a>';
      drawerContent.innerHTML = html;
    })
    .catch(function (err) {
      console.warn('Cart drawer load failed:', err);
    });
  }

  function initCartDrawer() {
    const closeBtn = document.getElementById('cart-drawer-close');
    const overlay = document.getElementById('cart-drawer-overlay');

    if (closeBtn) closeBtn.addEventListener('click', closeCartDrawer);
    if (overlay) overlay.addEventListener('click', closeCartDrawer);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeCartDrawer();
    });
  }

  // ==========================================
  // CART PAGE FUNCTIONALITY
  // ==========================================

  function initCartPage() {
    const cartForm = document.getElementById('cart-form');
    if (!cartForm) return;

    // Quantity buttons on cart page
    cartForm.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-cart-qty]');
      if (!btn) return;

      const action = btn.dataset.cartQty;
      const input = btn.closest('.cart-quantity')
        ? btn.closest('.cart-quantity').querySelector('.cart-qty-input')
        : null;

      if (!input) return;

      let val = parseInt(input.value, 10);
      if (action === 'minus') val = Math.max(0, val - 1);
      if (action === 'plus') val += 1;
      input.value = val;

      // Auto-update cart
      const line = input.dataset.line;
      if (line !== undefined) {
        updateCartLine(parseInt(line, 10), val);
      }
    });

    // Remove item
    cartForm.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-remove-line]');
      if (!btn) return;
      const line = parseInt(btn.dataset.removeLine, 10);
      updateCartLine(line, 0);
    });
  }

  function updateCartLine(line, quantity) {
    showLoading();
    fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: line, quantity: quantity })
    })
    .then(function (res) { return res.json(); })
    .then(function () {
      updateCartCount();
      window.location.reload();
    })
    .catch(function (err) {
      hideLoading();
      showToast('Fehler beim Aktualisieren des Warenkorbs.');
    });
  }

  // ==========================================
  // SMOOTH SCROLL
  // ==========================================

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          e.preventDefault();
          const headerHeight = 72;
          const top = target.getBoundingClientRect().top + window.scrollY - headerHeight;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
      });
    });
  }

  // ==========================================
  // INTERSECTION OBSERVER - SCROLL ANIMATIONS
  // ==========================================

  function initScrollAnimations() {
    const elements = document.querySelectorAll('.animate-on-scroll');
    if (!elements.length) return;

    if (!window.IntersectionObserver) {
      elements.forEach(function (el) { el.classList.add('visible'); });
      return;
    }

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      rootMargin: '0px 0px -60px 0px',
      threshold: 0.1
    });

    elements.forEach(function (el) {
      observer.observe(el);
    });
  }

  // ==========================================
  // HERO SECTION ENHANCEMENTS
  // ==========================================

  function initHeroSection() {
    const hero = document.querySelector('.hero-section');
    if (!hero) return;

    // Parallax on scroll
    window.addEventListener('scroll', function () {
      const scrollY = window.scrollY || window.pageYOffset;
      const heroBg = hero.querySelector('.hero-bg-image');
      if (heroBg && scrollY < window.innerHeight) {
        heroBg.style.transform = 'translateY(' + (scrollY * 0.3) + 'px)';
      }
    }, { passive: true });
  }

  // ==========================================
  // VARIANT SELECTOR
  // ==========================================

  function initVariantSelector() {
    const variantSelect = document.getElementById('variant-select');
    if (!variantSelect) return;

    variantSelect.addEventListener('change', function () {
      const selectedOption = this.options[this.selectedIndex];
      const price = selectedOption.dataset.price;
      const priceEl = document.getElementById('product-price');
      if (price && priceEl) {
        priceEl.textContent = formatMoney(parseInt(price, 10));
      }
    });
  }

  // ==========================================
  // COLLECTION FILTER (optional)
  // ==========================================

  function initCollectionFilters() {
    const filterBtns = document.querySelectorAll('[data-filter]');
    if (!filterBtns.length) return;

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  }

  // ==========================================
  // HEADER ACTIVE NAV LINK
  // ==========================================

  function initActiveNavLink() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.header-nav a, .mobile-nav a');

    navLinks.forEach(function (link) {
      const href = link.getAttribute('href');
      if (href && currentPath.startsWith(href) && href !== '/') {
        link.classList.add('active');
      } else if (href === '/' && currentPath === '/') {
        link.classList.add('active');
      }
    });
  }

  // ==========================================
  // ANNOUNCEMENT BAR (optional)
  // ==========================================

  function initAnnouncementBar() {
    const bar = document.getElementById('announcement-bar');
    const close = document.getElementById('announcement-close');
    if (!bar || !close) return;

    const dismissed = sessionStorage.getItem('announcement-dismissed');
    if (dismissed) {
      bar.style.display = 'none';
      return;
    }

    close.addEventListener('click', function () {
      bar.style.display = 'none';
      sessionStorage.setItem('announcement-dismissed', 'true');
    });
  }

  // ==========================================
  // LAZY LOADING IMAGES
  // ==========================================

  function initLazyImages() {
    const lazyImages = document.querySelectorAll('img[data-src]');
    if (!lazyImages.length) return;

    if (!window.IntersectionObserver) {
      lazyImages.forEach(function (img) {
        img.src = img.dataset.src;
      });
      return;
    }

    const imageObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      });
    });

    lazyImages.forEach(function (img) {
      imageObserver.observe(img);
    });
  }

  // ==========================================
  // INIT ALL
  // ==========================================

  document.addEventListener('DOMContentLoaded', function () {
    initStickyHeader();
    initMobileMenu();
    initScrollAnimations();
    initSmoothScroll();
    initProductCardButtons();
    initProductPage();
    initProductGallery();
    initProductTabs();
    initCartDrawer();
    initCartPage();
    initHeroSection();
    initVariantSelector();
    initCollectionFilters();
    initActiveNavLink();
    initAnnouncementBar();
    initLazyImages();
    updateCartCount();
  });

  // Expose useful functions globally
  window.WziyaSport = {
    addToCart: addToCart,
    showToast: showToast,
    updateCartCount: updateCartCount,
    openCartDrawer: openCartDrawer,
    closeCartDrawer: closeCartDrawer
  };

})();
