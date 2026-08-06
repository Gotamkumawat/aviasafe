CREATE DATABASE IF NOT EXISTS aviasafe_cms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aviasafe_cms;

CREATE TABLE IF NOT EXISTS pages (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  route VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  status ENUM('active','draft') NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_blocks (
  id CHAR(36) PRIMARY KEY,
  page_id VARCHAR(64) NOT NULL,
  type ENUM('heading','text','image','button','service_card') NOT NULL DEFAULT 'text',
  label VARCHAR(180) NOT NULL,
  content LONGTEXT,
  description LONGTEXT,
  image VARCHAR(500),
  alt VARCHAR(255),
  link VARCHAR(500),
  placement ENUM('page_top','after_hero','after_content','before_footer','service_grid') NOT NULL DEFAULT 'before_footer',
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_blocks_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  INDEX idx_blocks_page_order (page_id, sort_order)
);

CREATE TABLE IF NOT EXISTS content_changes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  page_id VARCHAR(64) NOT NULL,
  selector VARCHAR(1000) NOT NULL,
  values_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_changes_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  UNIQUE KEY uq_page_selector (page_id, selector(500))
);

CREATE TABLE IF NOT EXISTS media (
  id CHAR(36) PRIMARY KEY,
  original_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL UNIQUE,
  file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  mime_type VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS page_elements (
  id CHAR(36) PRIMARY KEY,
  page_id VARCHAR(64) NOT NULL,
  selector VARCHAR(1000) NOT NULL,
  element_type ENUM('heading','text','image','button','link') NOT NULL,
  admin_label VARCHAR(255) NOT NULL,
  original_text LONGTEXT,
  original_html LONGTEXT,
  original_src VARCHAR(1000),
  original_alt VARCHAR(500),
  original_href VARCHAR(1000),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_elements_page FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  UNIQUE KEY uq_page_element (page_id, selector(500)),
  INDEX idx_elements_page_order (page_id, sort_order)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'Administrator',
  avatar VARCHAR(500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  INDEX idx_session_expiry (expires_at)
);

CREATE TABLE IF NOT EXISTS navigation_items (
  id CHAR(36) PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  url VARCHAR(500) NOT NULL,
  target ENUM('_self','_blank') NOT NULL DEFAULT '_self',
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id CHAR(36) PRIMARY KEY,
  form_type ENUM('contact','quote','query','general') NOT NULL DEFAULT 'general',
  name VARCHAR(180),
  email VARCHAR(190),
  phone VARCHAR(80),
  subject VARCHAR(255),
  service VARCHAR(255),
  message LONGTEXT,
  payload_json JSON,
  status ENUM('new','in_progress','resolved','archived') NOT NULL DEFAULT 'new',
  source_path VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_submission_status_date (status,created_at),
  INDEX idx_submission_email (email)
);

CREATE TABLE IF NOT EXISTS service_catalog (
  id CHAR(36) PRIMARY KEY,
  slug VARCHAR(190) NOT NULL UNIQUE,
  title VARCHAR(190) NOT NULL,
  image VARCHAR(500),
  tagline TEXT,
  description LONGTEXT,
  points_json JSON,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS capability_catalog (
  id CHAR(36) PRIMARY KEY,
  part_number VARCHAR(120) NOT NULL,
  manufacturer VARCHAR(180) NOT NULL,
  description VARCHAR(500) NOT NULL,
  aircraft VARCHAR(180) NOT NULL,
  chapter VARCHAR(180) NOT NULL,
  service_slug VARCHAR(190),
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_capability_part (part_number),
  INDEX idx_capability_aircraft (aircraft),
  INDEX idx_capability_chapter (chapter)
);

CREATE TABLE IF NOT EXISTS seo_meta (
  id CHAR(36) PRIMARY KEY,
  page_route VARCHAR(255) NOT NULL UNIQUE,
  meta_title VARCHAR(255),
  meta_description TEXT,
  meta_keywords VARCHAR(500),
  og_title VARCHAR(255),
  og_description TEXT,
  og_image VARCHAR(500),
  og_type VARCHAR(50) DEFAULT 'website',
  canonical_url VARCHAR(500),
  robots VARCHAR(100) DEFAULT 'index, follow',
  structured_data JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_seo_route (page_route)
);
